import chalk from 'chalk';
import { stripIndent } from 'common-tags';
import { readFileSync as readFile, writeFileSync as writeFile } from 'fs';
import { sync as globby } from 'glob';
import { parse as parseJson } from 'json5';
import { join, resolve } from 'path';
import { CompilerOptions, transpileModule, TranspileOutput } from 'typescript';
import yargsInteractive, { Option as YargOptions } from 'yargs-interactive';

const ROOT_PATH = join(__dirname, '../');
const SRC_PATH = join(ROOT_PATH, 'src');

(async () => {
  interface YargResult {
    help: boolean;
    version: boolean;
    interactive: boolean;
    command: string | string[];
  }

  interface BaseTSConfig {
    compilerOptions: CompilerOptions;
    include: string[];
    exclude: string[];
  }

  const commandsDir = join(SRC_PATH, 'commands');
  const commands = globby(`${commandsDir}/**/*.ts`).map(file => {
    const parts = file.split('/');

    return parts[parts.length - 1].slice(0, -3);
  });

  const tsconfigFile = readFile(resolve(ROOT_PATH, 'tsconfig.json'), { encoding: 'utf8' });
  const baseTSConfig = parseJson(tsconfigFile) as BaseTSConfig;

  const compile = (fileContent: string, options?: CompilerOptions): TranspileOutput => {
    const compilerOptions: typeof options = {
      ...baseTSConfig.compilerOptions,
      ...options,
    };

    return transpileModule(fileContent, { compilerOptions });
  };

  try {
    const yargOptions: YargOptions = {
      interactive: { default: true },
      command: {
        type: 'checkbox',
        describe: 'Which commands should be reloaded?',
        prompt: 'if-empty',
        choices: commands,
      },
    };

    const results = await yargsInteractive()
      .usage((stripIndent`
    ${chalk.yellow('Command Reloader')}
    ${chalk.cyan('Usage:')}
        ${chalk.green('yarn reload')}
        ${chalk.green('yarn reload')} --command <command>
        ${chalk.green('yarn reload')} --help`
      ))
      .interactive(yargOptions) as YargResult;

    const commandsResult: string[] = Array.isArray(results.command) ? results.command : [ results.command ];

    if (!commandsResult.length) throw new Error('You didn\'t give any commands to reload');

    for (const result of commandsResult) {
      const filePath = globby(`${commandsDir}/**/${result}.ts`)[0];
      const fileContent = readFile(filePath, { encoding: 'utf8' });
      const transpiledModule = compile(fileContent).outputText;
      const distPath = filePath.replace(/\/src\//, '/dist/').replace(/\.ts$/, '.js');

      writeFile(distPath, transpiledModule, { encoding: 'utf8' });
    }

    console.info(chalk.green('Done!')); // eslint-disable-line no-console

    return process.exit(0);
  } catch (err) {
    console.error(chalk.red(err)); // eslint-disable-line no-console

    return process.exit(1);
  }
})();