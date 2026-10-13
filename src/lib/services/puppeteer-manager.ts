import { createScopedLogger } from "@/lib/logger";
import puppeteer, { type Browser, type Page, type PDFOptions } from "puppeteer";
import fs from "node:fs";

const scopedLogger = createScopedLogger("puppeteer-manager");

export function resolveChromeExecutablePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }

  const candidates = [
    // Windows Chrome
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    // Windows Edge
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export interface RenderPdfOptions {
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
  };
  pdfOptions: PDFOptions;
  waitForFonts?: boolean;
  timeoutMs?: number;
}

class InProcessPdfSemaphore {
  private current = 0;
  private queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(
    private readonly maxConcurrency: number,
    private readonly timeoutMs: number = 30000
  ) {}

  async acquire(): Promise<() => void> {
    if (this.current < this.maxConcurrency) {
      this.current++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }

    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((item) => item.timer === timer);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(
            new Error(
              `PDF generation queue timeout after ${this.timeoutMs}ms (max concurrency: ${this.maxConcurrency})`
            )
          );
        }
      }, this.timeoutMs);
      timer.unref();

      this.queue.push({
        resolve: () => {
          clearTimeout(timer);
          let released = false;
          resolve(() => {
            if (!released) {
              released = true;
              this.release();
            }
          });
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });
    });
  }

  private release() {
    this.current--;
    if (this.queue.length > 0 && this.current < this.maxConcurrency) {
      this.current++;
      const next = this.queue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  get activeCount(): number {
    return this.current;
  }

  get queueLength(): number {
    return this.queue.length;
  }
}

export class PuppeteerManager {
  private browserInstance: Browser | null = null;
  private browserPromise: Promise<Browser> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private readonly semaphore: InProcessPdfSemaphore;
  private readonly idleTimeoutMs: number;

  constructor() {
    const maxConcurrency = process.env.PDF_CONCURRENCY_LIMIT
      ? parseInt(process.env.PDF_CONCURRENCY_LIMIT, 10)
      : 2;
    const queueTimeout = process.env.PDF_QUEUE_TIMEOUT_MS
      ? parseInt(process.env.PDF_QUEUE_TIMEOUT_MS, 10)
      : 30000;
    this.idleTimeoutMs = process.env.PDF_IDLE_TIMEOUT_MS
      ? parseInt(process.env.PDF_IDLE_TIMEOUT_MS, 10)
      : 60000;

    this.semaphore = new InProcessPdfSemaphore(maxConcurrency, queueTimeout);
  }

  private async getBrowser(): Promise<Browser> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.browserInstance && this.browserInstance.connected) {
      return this.browserInstance;
    }

    if (!this.browserPromise) {
      const executablePath = resolveChromeExecutablePath();
      this.browserPromise = puppeteer
        .launch({
          headless: true,
          executablePath,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-breakpad",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-domain-reliability",
            "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process",
            "--disable-hang-monitor",
            "--disable-ipc-flooding-protection",
            "--disable-popup-blocking",
            "--disable-prompt-on-repost",
            "--disable-renderer-backgrounding",
            "--disable-sync",
            "--disable-translate",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-first-run",
            "--safebrowsing-disable-auto-update",
            "--font-render-hinting=none",
          ],
        })
        .then((browser) => {
          this.browserInstance = browser;
          browser.on("disconnected", () => {
            scopedLogger.info("[PuppeteerManager] Chromium instance disconnected");
            this.browserInstance = null;
            this.browserPromise = null;
          });
          return browser;
        })
        .catch((err) => {
          this.browserInstance = null;
          this.browserPromise = null;
          throw err;
        });
    }

    return this.browserPromise;
  }

  private scheduleIdleShutdown() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    if (!this.browserInstance) return;

    this.idleTimer = setTimeout(async () => {
      if (this.semaphore.activeCount === 0 && this.browserInstance) {
        scopedLogger.info("[PuppeteerManager] Idle timeout reached: closing Chromium to liberate RAM");
        const b = this.browserInstance;
        this.browserInstance = null;
        this.browserPromise = null;
        await b.close().catch(() => {});
      }
    }, this.idleTimeoutMs);
    this.idleTimer.unref();
  }

  async generatePdfFromHtml(html: string, options: RenderPdfOptions): Promise<Buffer> {
    const release = await this.semaphore.acquire();
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      try {
        // Optimize page resource loading: block media/video/manifest/websockets that PDFs do not need
        await page.setRequestInterception(true);
        page.on("request", (req) => {
          const resType = req.resourceType();
          if (["media", "websocket", "manifest", "other"].includes(resType)) {
            req.abort().catch(() => {});
          } else {
            req.continue().catch(() => {});
          }
        });

        if (options.viewport) {
          await page.setViewport(options.viewport);
        }

        const timeout = options.timeoutMs ?? 25000;
        await page.setContent(html, {
          waitUntil: "load",
          timeout,
        });

        if (options.waitForFonts) {
          await page.evaluate(() => {
            const doc = (globalThis as any).document;
            return doc?.fonts?.ready ?? Promise.resolve();
          });
        }

        const pdfBuffer = await page.pdf(options.pdfOptions);
        return Buffer.from(pdfBuffer);
      } finally {
        await page.close().catch(() => {});
      }
    } finally {
      release();
      this.scheduleIdleShutdown();
    }
  }

  async close(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.browserInstance) {
      const b = this.browserInstance;
      this.browserInstance = null;
      this.browserPromise = null;
      await b.close().catch(() => {});
    }
  }
}

export const puppeteerManager = new PuppeteerManager();
