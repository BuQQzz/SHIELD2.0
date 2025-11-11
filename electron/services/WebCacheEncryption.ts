import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import { app } from "electron";
import path from "path";
import fs from "fs";

/**
 * Encryption service for web cache content
 * Uses AES-256-GCM for secure, authenticated encryption
 */
export class WebCacheEncryption {
  private encryptionKey: Buffer | null = null;
  private readonly algorithm = "aes-256-gcm";
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;

  /**
   * Initialize encryption key (load existing or generate new)
   */
  initialize(): void {
    const userDataPath = app.getPath("userData");
    const keyPath = path.join(userDataPath, ".cache-key");

    try {
      if (fs.existsSync(keyPath)) {
        const keyData = fs.readFileSync(keyPath);
        this.encryptionKey = Buffer.from(keyData.toString("utf-8"), "hex");
      } else {
        const salt = randomBytes(16);
        const password = randomBytes(32).toString("hex");
        this.encryptionKey = scryptSync(password, salt, this.keyLength);

        fs.writeFileSync(keyPath, this.encryptionKey.toString("hex"), {
          mode: 0o600,
        });

        console.log("[WebCache] Generated new encryption key");
      }
    } catch (error) {
      console.error("[WebCache] Failed to initialize encryption:", error);
      throw new Error("Failed to initialize cache encryption");
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  encrypt(data: string): Buffer {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(data, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, encrypted, tag]);
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decrypt(encrypted: Buffer): string {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    const iv = encrypted.subarray(0, this.ivLength);
    const tag = encrypted.subarray(encrypted.length - this.tagLength);
    const data = encrypted.subarray(
      this.ivLength,
      encrypted.length - this.tagLength
    );

    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    return decipher.update(data) + decipher.final("utf8");
  }

  /**
   * Check if encryption is initialized
   */
  isInitialized(): boolean {
    return this.encryptionKey !== null;
  }
}
