'use strict';

// Regression test for #2220: headless mempalace-capture instructed
// `mempalace mine <path> --wing <wing> --room <room>`, but `mine` has no
// --room flag (only `search` does). The fix replaced the flag with a
// detect_room()-based staging approach.
//
// #2414 extension: the staging block also embeds a `rooms:` YAML example.
// mempalace's miner (`detect_room()` and `_mine_impl`) requires each entry
// to be a DICT with at least a `name` key — a bare-string list crashes the
// first `mine` invocation with `TypeError: string indices must be integers,
// not 'str'`. The fix converts each `- <room>` to `- name: <room>`.
//
// Docs sources:
//   CLI reference:  https://mempalaceofficial.com/reference/cli.html
//   Mining guide:   https://mempalaceofficial.com/guide/mining.html
//   Config guide:   https://mempalaceofficial.com/guide/configuration.html

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const MEMPALACE_SURFACE_FILES = [
  'capabilities/mempalace/fragments/capture-problems.md',
  'capabilities/mempalace/fragments/recall-discuss.md',
  'agents/gsd-mempalace-curator.md',
];

const MINE_CMD_RE = /^\s*mempalace\s+mine\b/;

describe('#2220 — headless mempalace mine has no --room flag', () => {
  for (const rel of MEMPALACE_SURFACE_FILES) {
    test(`${rel}: no "mine ... --room" command line`, () => {
      const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const mineCmdLines = content
        .split(/\r?\n/)
        .filter((l) => MINE_CMD_RE.test(l));
      for (const line of mineCmdLines) {
        assert.doesNotMatch(
          line,
          /--room/,
          `${rel}: "mempalace mine" command must not include --room (mine has no such flag per CLI reference). Offending line: ${line.trim()}`,
        );
      }
    });
  }

  test('capture-problems.md: references detect_room staging and explicit no --room rule', () => {
    const rel = 'capabilities/mempalace/fragments/capture-problems.md';
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(content.includes('mempalace mine'), `${rel}: must reference mempalace mine`);
    assert.ok(content.includes('detect_room'), `${rel}: must reference detect_room() as the room-assignment mechanism`);
    assert.ok(content.includes('no `--room` flag'), `${rel}: must warn against passing --room to mempalace mine`);
  });

  test('.gitignore: .mempalace-stage/ is excluded', () => {
    const content = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    assert.ok(content.includes('.mempalace-stage/'), '.gitignore must exclude .planning/.mempalace-stage/');
  });
});

describe('#2414 — no legacy bare-string rooms YAML heredocs across mempalace docs', () => {
  test('mempalace fragments and curator never reintroduce bare-string rooms YAML blocks', () => {
    for (const rel of MEMPALACE_SURFACE_FILES) {
      const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const lines = content.split(/\r?\n/);
      const roomsIdx = lines.findIndex((l) => /^\s*rooms:\s*$/.test(l));
      if (roomsIdx === -1) continue;
      const tail = lines.slice(roomsIdx + 1, roomsIdx + 20);
      const bareStringEntries = tail.filter((l) => /^\s*-\s+[A-Za-z][A-Za-z0-9_-]*\s*$/.test(l));
      assert.strictEqual(
        bareStringEntries.length,
        0,
        `${rel}: rooms: must not contain bare-string entries (#2414): ${JSON.stringify(bareStringEntries)}`,
      );
    }
  });
});
