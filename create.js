"use strict";

/*
 * npm init project
 * some bits of code collected from: node-typescript-starter/master/bin/setup 
 * written by: eram on 05-mar-2021
 */

const path = require("path");
const os = require("os");
const exec = require("child_process").exec;
const fs = require("fs");
const readline = require("readline");

const errno = os.constants.errno;
const afs = fs.promises;
const ok = () => console.log("%cOK", "color:green");
const log = (str) => console.log("%c" + str, "color:blue");
const error = (str) => console.log("%c" + str, "color:red");

// recursive remove directory
async function rmdirRecursive(folder) {
  if (fs.existsSync(folder)) {
    for (let entry of await afs.readdir(folder)) {
      const curPath = path.join(folder, entry);
      if ((await afs.lstat(curPath)).isDirectory()) {
        await rmdirRecursive(curPath);
      } else {
        await afs.unlink(curPath);
      }
    }
    await afs.rmdir(folder);
  }
}

// run a shell command with a spinner
async function runShellCmd(command, spinner) {
  return new Promise((resolve, reject) => {

    const clock = ["-\r", "\\\r", "|\r", "/\r"];
    let clockIdx = 0;
    let interval = 0;
    spinner = !!spinner;
    if (spinner) {
      interval = setInterval(() => process.stdout.write(clock[clockIdx++ % clock.length]), 1000);
    }

    // console.log(">", command);
    const child = exec(command);
    child.stdout.on("data", (data) => {
      process.stdout.write(data);
    });
    child.stderr.on("data", (data) => {
      process.stderr.write(data);
    });
    child.addListener("error", (err) => {
      reject(err);
    });
    child.addListener("exit", (code) => {
      if (interval) clearInterval(interval);
      if (code === 0) {
        if (spinner) console.log("%cOK", "color:green");
        resolve(code);
      } else {
        reject(new Error(`Failed with exit code ${code}`));
      }
    });
  });
}

// prompt user for one-line input with default value
async function prompt(ask, defVal) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface(process.stdin, process.stdout);
    rl.question(`${ask} [${defVal}]: `, (answer) => {
      answer = answer || defVal;
      rl.close();
      resolve(answer);
    });
    rl.on("SIGINT", () => reject(new Error("SIGINT")));
  });
}


try {
  void (async function () {

    /*
     * Steps:
     * Validate node version
     * Prompt user for input
     * Clone git to folder
     * Remove .git folder
     * Save new package.json
     * Find-replace package name in files
     * Run git init
     * Run npm install
     * Run vscode
     * Done message
     */

    const nodeVer = parseFloat(process.version.substr(1, process.version.length));
    if (nodeVer < 14.0) {
      error("Error: NodeJS version 14+ required");
      return errno.EBADF;
    }

    const conf = require("./package.json").conf;
    process.stdin.setEncoding("utf8");
    process.stdout.setEncoding("utf8");
    process.on("uncaughtException", (err) => { console.error("ERR!", err); process.exit(errno.EBADF); });
    process.on("unhandledRejection", (err) => { console.error("ERR!", err); process.exit(errno.EBADF); });

    if (process.argv.slice(2).length <= 0) {
      error(`Usage: npm init ${conf.name} <name> [vscode]`);
      return errno.EINVAL;
    }

    conf.name = process.argv.slice(2)[0];

    const folderPath = path.join(process.cwd(), conf.name);
    if (fs.existsSync(folderPath)) {
      error(`Error: destination path '${conf.name}' already exists and is not an empty directory.`);
      return errno.EINVAL;
    }

    conf.startMsg.forEach(log);
    conf.runVsCode = (process.argv.slice(3).length > 1);
    conf.version = await prompt("Version", "0.0.0");
    conf.description = await prompt("Description", conf.description);
    conf.author = await prompt("Author (github username)", "-");
    conf.repository = { type: "git", url: await prompt("Git repo", `https://github.com/${conf.author}/${conf.name}.git`) };
    let yn = await prompt("Repo is private", "Y/n");
    conf.private = yn.toLowerCase().startsWith("y") ? "true" : "false";
    conf.license = await prompt("License", "ISC");

    yn = await prompt("Is the above OK?", "Y/n");
    if (!yn.toLowerCase().startsWith("y")) {
      return 0
    }

    log(`Cloning repo ${conf.repo} to '${conf.name}' ...`);
    await runShellCmd(`git clone --depth 1 ${conf.repo} ${conf.name}`, true);

    log(`Removing original .git folder...`);
    await rmdirRecursive(`${folderPath}/.git`);
    ok();

    process.chdir(folderPath);
    log(`Cwd: ${process.cwd()}`);
    const pkgfile = path.join(folderPath, "package.json");
    const pkg = require(pkgfile);

    log("Replace package name in files...");
    conf.replaceFiles.forEach(filename => {
      filename = path.join(folderPath, filename);
      log(` replace ${filename}`);
      const str = fs.readFileSync(filename, "utf-8");
      const replacer = new RegExp(pkg.name, 'g')
      const data = str.replace(replacer, conf.name);
      fs.writeFileSync(filename, data, "utf-8");
    });
    ok();

    log(`Writing package.json file to ${folderPath}...`);
    ["name", "version", "description", "author", "repository", "private", "license"].forEach(key => { pkg[key] = conf[key]; });
    await afs.writeFile(pkgfile, JSON.stringify(pkg, null, 2), "utf-8");
    ok();

    log(`Initializing .git folder...`);
    await runShellCmd(`git init && git add . && git commit -am "code from ${conf.repo}"`, true);

    log(`Installing dependencies, please wait...`);
    await runShellCmd(`npm i`, true);

    if (conf.runVsCode) {
      log(`Starting vscode...`);
      await runShellCmd(`code ${folderPath}/.`, true);
    }

    log("Done.")
    log("Commands to run the project:");
    conf.doneMsg.unshift(`> cd ${conf.name}`);
    conf.doneMsg.forEach(log);

    return 0;
  })();
} catch (err) {
  console.critical(`%c${err.message || err}`, "coloer:red");
}
