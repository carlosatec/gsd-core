'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const installEngine = require('../gsd-core/bin/lib/install-engine.cjs');

describe('Self-Repo Uninstall Guard (Task 23.05, D-123)', () => {
  test('allows global scope uninstall even when pointing to source repo', () => {
    assert.doesNotThrow(() => {
      installEngine.assertNotSourceRepository(process.cwd(), true);
    });
  });

  test('allows local uninstall in normal project directories', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dummy-client-app-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'my-client-app', version: '1.0.0' })
      );
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });

      assert.doesNotThrow(() => {
        installEngine.assertNotSourceRepository(tmpDir, false);
      });
    } finally {
      cleanup(tmpDir);
    }
  });

  test('refuses local uninstall when targetDir is @opengsd/gsd-core source repo', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-fake-src-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: '@opengsd/gsd-core', version: '3.2.0' })
      );
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });

      assert.throws(
        () => {
          installEngine.assertNotSourceRepository(tmpDir, false);
        },
        {
          message: /Refusing to uninstall locally from inside the GSD Core source development repository/,
        }
      );
    } finally {
      cleanup(tmpDir);
    }
  });

  test('refuses local uninstall when targetDir is gsd-core source repo', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-fake-legacy-src-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'gsd-core', version: '3.2.0' })
      );
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });

      assert.throws(
        () => {
          installEngine.assertNotSourceRepository(tmpDir, false);
        },
        {
          message: /Refusing to uninstall locally from inside the GSD Core source development repository/,
        }
      );
    } finally {
      cleanup(tmpDir);
    }
  });
});
