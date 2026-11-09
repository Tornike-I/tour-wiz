#!/usr/bin/env node
// Agents use their person's GitHub token, so only this hook can hold them to the AGENTS.md PR flow.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROTECTED = new Set(["main", "master"]);

const input = JSON.parse(readFileSync(0, "utf8"));
const command = input?.tool_input?.command ?? "";
const cwd = input?.cwd || process.cwd();

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `${reason} See "Pull requests" in AGENTS.md. If a person wants this done, they run it themselves.`,
      },
    }),
  );
  process.exit(0);
}

function tokenize(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ""));
}

function run(file, args) {
  try {
    return execFileSync(file, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function currentBranch() {
  return run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
}

function branchName(ref) {
  return ref.replace(/^\+/, "").replace(/^refs\/heads\//, "");
}

function checkGit(args) {
  let sub = 0;
  while (sub < args.length && args[sub].startsWith("-")) sub += args[sub] === "-c" || args[sub] === "-C" ? 2 : 1;
  const verb = args[sub];
  const rest = args.slice(sub + 1);

  if (rest.includes("--no-verify") || (verb === "commit" && rest.includes("-n"))) {
    deny("Agents must not skip git hooks with --no-verify.");
  }
  if (verb !== "push") return;

  if (rest.some((a) => /^(-f|--force|--force-with-lease.*|--force-if-includes|--mirror|--all|--delete|-d)$/.test(a))) {
    deny("Agents must not force-push, mirror, push all branches or delete remote branches.");
  }
  const positional = rest.filter((a) => !a.startsWith("-"));
  const refspecs = positional.slice(1);
  if (refspecs.some((r) => r.startsWith("+") || r.startsWith(":"))) {
    deny("Agents must not force-push or delete remote branches.");
  }
  const targets = refspecs.length ? refspecs.map((r) => (r.includes(":") ? r.split(":")[1] : r)) : ["HEAD"];
  for (const target of targets) {
    const name = branchName(target) === "HEAD" ? currentBranch() : branchName(target);
    if (PROTECTED.has(name)) {
      deny(`Agents must not push to ${name}. Push a feature branch and open a PR.`);
    }
  }
}

function checkGh(args) {
  const [group, action, ...rest] = args;

  if (group === "pr" && action === "merge") {
    if (rest.includes("--admin")) deny("Agents must not merge with --admin.");
    const target = rest.find((a) => !a.startsWith("-"));
    const decision = run("gh", ["pr", "view", ...(target ? [target] : []), "--json", "reviewDecision", "--jq", ".reviewDecision"]);
    if (decision !== "APPROVED") {
      deny(`Agents may merge only an approved PR (review decision: ${decision || "unknown"}).`);
    }
  }

  if (group === "pr" && action === "review" && rest.some((a) => a === "--approve" || a === "-a")) {
    deny("Agents must not approve PRs; a person reviews.");
  }

  if (group === "repo" && action === "edit" && rest.some((a) => a.startsWith("--visibility"))) {
    deny("Agents must not change repository visibility.");
  }

  if (group === "api") {
    const joined = args.join(" ");
    const method = (joined.match(/(?:-X|--method)[ =](\w+)/) ?? [])[1]?.toUpperCase();
    const writes = (method && method !== "GET") || /\s(-f|-F|--field|--raw-field|--input)\b/.test(` ${joined}`);
    if (!writes) return;
    if (/\/(rulesets|protection)\b/.test(joined)) deny("Agents must not change rulesets or branch protection.");
    if (/\/pulls\/\d+\/merge\b/.test(joined)) deny("Agents must merge through `gh pr merge`, not the API.");
    if (/\/pulls\/\d+\/reviews\b/.test(joined) && /APPROVE/.test(joined)) deny("Agents must not approve PRs; a person reviews.");
    if (/\/(git\/refs|git\/ref)\/heads\/(main|master)\b/.test(joined)) deny("Agents must not move main directly.");
  }
}

for (const segment of command.split(/&&|\|\||[;|\n]/)) {
  const tokens = tokenize(segment.trim());
  const start = tokens.findIndex((t) => /^(git|gh)(\.exe)?$/i.test(t.split(/[\\/]/).pop() ?? ""));
  if (start === -1) continue;
  const tool = tokens[start].split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, "");
  const args = tokens.slice(start + 1);
  if (tool === "git") checkGit(args);
  else checkGh(args);
}
