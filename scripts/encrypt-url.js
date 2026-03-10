#!/usr/bin/env node
/**
 * Encrypts a download URL with a password and updates docs/index.html.
 *
 * Usage:
 *   node scripts/encrypt-url.js
 *
 * It will prompt for the download URL and a password, then write
 * the encrypted values into docs/index.html automatically.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function main() {
  const url = await ask("Download URL (e.g. GitHub Release asset URL): ");
  const password = await ask("Access password: ");
  const confirmPassword = await ask("Confirm password: ");
  rl.close();

  if (!url.trim()) {
    console.error("Error: URL cannot be empty.");
    process.exit(1);
  }

  if (password !== confirmPassword) {
    console.error("Error: Passwords do not match.");
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Error: Password must be at least 6 characters.");
    process.exit(1);
  }

  // Generate salt and IV
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  // Derive key using PBKDF2 (matches Web Crypto in the browser)
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

  // Encrypt URL with AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedData = Buffer.concat([encrypted, authTag]);

  // Hash password for quick client-side verification
  const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

  // Convert to hex strings
  const values = {
    ENCRYPTED_DATA: encryptedData.toString("hex"),
    SALT: salt.toString("hex"),
    IV: iv.toString("hex"),
    PASSWORD_HASH: passwordHash,
  };

  // Update docs/index.html
  const htmlPath = path.join(__dirname, "..", "docs", "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");

  for (const [key, value] of Object.entries(values)) {
    html = html.replace(
      new RegExp(`const ${key} = ".*?";`),
      `const ${key} = "${value}";`
    );
  }

  fs.writeFileSync(htmlPath, html);

  console.log("\nDone! Updated docs/index.html with encrypted download link.");
  console.log("Deploy to GitHub Pages to make it live.");
  console.log(`\nPassword hash: ${passwordHash.substring(0, 12)}...`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
