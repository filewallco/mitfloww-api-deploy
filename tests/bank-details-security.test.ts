import test from "node:test";
import assert from "node:assert/strict";
import { BankDetailsService } from "../src/lib/services/bank-details-service";

test("Bank Details Security: AES-256-GCM authenticated encryption and decryption", () => {
  const service = new BankDetailsService();
  const rawAccount = "1234567890123456";
  const rawRouting = "HDFC0001234";

  const ciphertext1 = service.encrypt(rawAccount);
  const ciphertext2 = service.encrypt(rawAccount);

  // Each encryption must use a unique random IV so ciphertexts are never identical
  assert.notEqual(ciphertext1, ciphertext2);
  assert.notEqual(ciphertext1, rawAccount);

  // Decryption must recover the original data
  const decrypted1 = service.decrypt(ciphertext1);
  const decrypted2 = service.decrypt(ciphertext2);
  assert.equal(decrypted1, rawAccount);
  assert.equal(decrypted2, rawAccount);

  const routingCipher = service.encrypt(rawRouting);
  assert.equal(service.decrypt(routingCipher), rawRouting);
});

test("Bank Details Security: Tampering with ciphertext fails authenticated decryption", () => {
  const service = new BankDetailsService();
  const ciphertext = service.encrypt("987654321098");

  // Corrupt a byte in the base64url ciphertext
  const buffer = Buffer.from(ciphertext, "base64url");
  buffer[buffer.length - 2] ^= 0xff; // Flip bits
  const tampered = buffer.toString("base64url");

  assert.throws(
    () => {
      service.decrypt(tampered);
    },
    /Unsupported state or unable to authenticate data|bank_decrypt_failed|Malformed/
  );
});

test("Bank Details Security: Masking displays only last 4 digits", () => {
  const service = new BankDetailsService();
  const masked = service.maskAccountNumber("4321");
  assert.equal(masked, "•••• •••• •••• 4321");
  assert.equal(masked.endsWith("4321"), true);
});
