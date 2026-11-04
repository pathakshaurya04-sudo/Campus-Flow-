import "dotenv/config";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";
import { getSupabaseClient } from "../src/config/supabase.js";

const PASSWORD_MAX_BYTES = 72;

function ask(question) {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    prompt.question(question, (answer) => {
      prompt.close();
      resolve(answer.trim());
    });
  });
}

function askSecret(question) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal to enter the password safely.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (buffer) => {
      const character = buffer.toString("utf8");
      if (character === "\u0003") {
        input.setRawMode(false);
        input.pause();
        input.off("data", onData);
        reject(new Error("Admin setup cancelled."));
      } else if (character === "\r" || character === "\n") {
        input.setRawMode(false);
        input.pause();
        input.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
        process.stdout.write("\b \b");
      } else if (character >= " ") {
        value += character;
        process.stdout.write("*");
      }
    };

    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function validPassword(password) {
  return (
    password.length >= 12 &&
    Buffer.byteLength(password, "utf8") <= PASSWORD_MAX_BYTES &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function main() {
  const email = (await ask("Admin email: ")).toLowerCase();
  const fullName = await ask("Admin full name: ");
  const departmentId = await ask("Department UUID (leave empty for none): ");
  const password = await askSecret("Admin password (hidden): ");
  if (!validPassword(password)) {
    throw new Error("Password must meet the configured minimum complexity.");
  }

  const confirmation = (await ask("Create this Admin account? Type yes to continue: "))
    .toLowerCase();
  if (confirmation !== "yes") {
    process.stdout.write("Admin account creation cancelled.\n");
    return;
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const departmentValid =
    !departmentId ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      departmentId,
    );
  if (!emailValid || !fullName || !departmentValid) {
    throw new Error("Email, full name, or department UUID is invalid.");
  }

  const { data: user, error } = await getSupabaseClient()
    .from("users")
    .insert({
      email,
      password_hash: await bcrypt.hash(password, 12),
      full_name: fullName,
      role: "admin",
      department_id: departmentId || null,
    })
    .select("user_id")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("That email is already registered.");
    if (error.code === "23503") throw new Error("The department UUID does not exist.");
    console.error("Admin account creation failed:", error.code || "UNKNOWN");
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Admin account created. User ID: ${user.user_id}\n`);
}

main().catch((error) => {
  console.error(error.message || "Admin account creation failed.");
  process.exitCode = 1;
});
