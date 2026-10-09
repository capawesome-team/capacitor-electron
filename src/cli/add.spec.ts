import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { substitute } from './add';

const templatesDir = join(__dirname, '../../templates/scaffold');
const appName = `Bob's "Notes" <&> \\ App`;
const variables = {
  APP_ID: 'com.example.app',
  APP_NAME: appName,
  APP_NAME_SLUG: 'bob-s-notes-app',
};

const render = (fileName: string): string =>
  substitute(
    readFileSync(join(templatesDir, fileName), 'utf8'),
    fileName,
    variables,
  );

describe('substitute', () => {
  it('keeps package.json valid for app names with quotes', () => {
    const packageJson = JSON.parse(render('package.json'));

    expect(packageJson.productName).toBe(appName);
    expect(packageJson.description).toContain(appName);
  });

  it('keeps electron-builder.config.js valid for app names with quotes', () => {
    const module = { exports: {} as { productName?: string } };
    new Function('module', render('electron-builder.config.js'))(module);

    expect(module.exports.productName).toBe(appName);
  });

  it('escapes the app name in HTML templates', () => {
    const html = render('assets/splash.html');

    expect(html).toContain(
      '<title>Bob&#39;s &quot;Notes&quot; &lt;&amp;&gt; \\ App</title>',
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(substitute('{{UNKNOWN}}', 'file.md', variables)).toBe('{{UNKNOWN}}');
  });
});
