import crypto from "node:crypto";
import { AppError } from "@/lib/errors/app-error";

const SESSION_SECRET = process.env.SESSION_SECRET || "mitfloww_github_secret_key_salt_2026";
const ENCRYPTION_KEY = crypto.scryptSync(SESSION_SECRET, "mitfloww-gh-salt", 32);
const GCM_IV_LENGTH = 12;
const GCM_AUTH_TAG_LENGTH = 16;

export interface GithubRepoMetadata {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  description: string | null;
  languages: string[];
  sizeKb?: number;
}

export interface GithubCommitMetadata {
  sha: string;
  shortSha: string;
  commitMessage: string;
  committedAt: Date;
  commitAuthor: string;
  authorAvatarUrl?: string;
}

export class GithubService {
  /**
   * Encrypts a GitHub Personal Access Token using AES-256-GCM
   */
  encryptToken(token: string): string {
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64url");
  }

  /**
   * Decrypts an encrypted GitHub token
   */
  decryptToken(ciphertext: string): string {
    const buffer = Buffer.from(ciphertext, "base64url");
    if (buffer.length < GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH) {
      throw new AppError("Malformed GitHub token storage.", 500, "token_decrypt_failed");
    }
    const iv = buffer.subarray(0, GCM_IV_LENGTH);
    const tag = buffer.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  /**
   * Parses repository owner and name from varied URL formats:
   * - https://github.com/owner/repo
   * - https://github.com/owner/repo.git
   * - owner/repo
   */
  parseRepoUrl(input: string): { owner: string; repo: string } {
    const cleaned = input.trim().replace(/\.git$/i, "").replace(/^git@github\.com:/i, "https://github.com/");
    let pathname = cleaned;
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      try {
        const parsed = new URL(cleaned);
        const host = parsed.hostname.toLowerCase();
        if (host !== "github.com" && host !== "www.github.com") {
          throw new AppError("Only GitHub repositories (github.com) are supported.", 400, "invalid_repo_url");
        }
        pathname = parsed.pathname;
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError("Invalid repository URL format.", 400, "invalid_repo_url");
      }
    }

    const segments = pathname.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
    if (segments.length < 2 || !segments[0] || !segments[1]) {
      throw new AppError(
        "Invalid GitHub repository. Please provide a URL in the format https://github.com/owner/repo.",
        400,
        "invalid_repo_url",
      );
    }

    return {
      owner: segments[0].trim(),
      repo: segments[1].trim(),
    };
  }

  /**
   * Verifies access to a repository and fetches repository metadata and top languages.
   */
  async verifyRepository(
    token: string | null | undefined,
    owner: string,
    repo: string,
  ): Promise<GithubRepoMetadata> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "MitFloww-App",
    };
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const repoUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const res = await fetch(repoUrl, { headers });

    if (res.status === 404) {
      throw new AppError(
        "Repository not found on GitHub. If this is a private repository, please ensure your GitHub Token has repository read access.",
        404,
        "repo_not_found",
      );
    }

    if (res.status === 401 || res.status === 403) {
      const msg = await res.text();
      if (msg.includes("rate limit")) {
        throw new AppError("GitHub API rate limit exceeded. Please try again later.", 429, "github_rate_limited");
      }
      throw new AppError(
        "Invalid or insufficient GitHub permissions. Please provide a token with repository read permissions.",
        403,
        "github_unauthorized",
      );
    }

    if (!res.ok) {
      throw new AppError(`GitHub API responded with status ${res.status}.`, 502, "github_api_error");
    }

    const data = await res.json() as any;

    // Fetch languages
    let languages: string[] = [];
    try {
      const langRes = await fetch(data.languages_url || `${repoUrl}/languages`, { headers });
      if (langRes.ok) {
        const langData = (await langRes.json()) as Record<string, number>;
        languages = Object.keys(langData).slice(0, 5);
      }
    } catch {}

    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      owner: data.owner?.login || owner,
      defaultBranch: data.default_branch || "main",
      isPrivate: Boolean(data.private),
      htmlUrl: data.html_url || `https://github.com/${owner}/${repo}`,
      description: data.description || null,
      languages,
      sizeKb: typeof data.size === "number" ? data.size : 0,
    };
  }

  /**
   * Fetches the latest commit metadata on a specific branch.
   */
  async fetchLatestCommit(
    token: string | null | undefined,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GithubCommitMetadata> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "MitFloww-App",
    };
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const commitUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`;
    const res = await fetch(commitUrl, { headers });

    if (!res.ok) {
      if (res.status === 404) {
        throw new AppError(`Branch "${branch}" not found in repository.`, 404, "branch_not_found");
      }
      throw new AppError(`Failed to fetch latest commit from GitHub (status ${res.status}).`, 502, "github_api_error");
    }

    const data = await res.json() as any;
    const sha = data.sha;
    const commitMessage = data.commit?.message || "No commit message";
    const committedAt = data.commit?.author?.date ? new Date(data.commit.author.date) : new Date();
    const commitAuthor = data.commit?.author?.name || data.author?.login || "Developer";
    const authorAvatarUrl = data.author?.avatar_url || undefined;

    return {
      sha,
      shortSha: sha.slice(0, 7),
      commitMessage,
      committedAt,
      commitAuthor,
      authorAvatarUrl,
    };
  }

  /**
   * Downloads the repository zipball archive for a specific commit SHA.
   */
  async downloadZipball(
    token: string | null | undefined,
    owner: string,
    repo: string,
    commitSha: string,
  ): Promise<{ buffer: Buffer; sizeBytes: number }> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "MitFloww-App",
    };
    if (token) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const archiveUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/${encodeURIComponent(commitSha)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    let res;
    try {
      res = await fetch(archiveUrl, {
        headers,
        redirect: "follow",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      throw new AppError(`Failed to download repository archive from GitHub (status ${res.status}).`, 502, "github_download_failed");
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      buffer,
      sizeBytes: buffer.byteLength,
    };
  }
}

export const githubService = new GithubService();
