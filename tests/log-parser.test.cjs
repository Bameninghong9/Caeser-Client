const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createLogParser, parseLog4jXmlBlock } = require('../src/game/log-parser.cjs');

describe('Log Parser', () => {
  test('parses single-line Log4j XML event', () => {
    const lines = [];
    const parser = createLogParser(l => lines.push(l));

    parser.feed('<log4j:Event logger="Sodium" timestamp="1791394297221" level="INFO" thread="main"><log4j:Message><![CDATA[Loaded configuration file for Sodium: 36 options available, 0 override(s) found]]></log4j:Message></log4j:Event>');
    parser.flush();

    assert.equal(lines.length, 1);
    assert.match(lines[0], /\[INFO\] \[Sodium\]: Loaded configuration file for Sodium: 36 options available, 0 override\(s\) found/);
  });

  test('parses multi-line Log4j XML event', () => {
    const lines = [];
    const parser = createLogParser(l => lines.push(l));

    parser.feed('  <log4j:Event logger="FabricLoader/GameProvider" timestamp="1791394292800" level="INFO" thread="main">');
    parser.feed('    <log4j:Message><![CDATA[Loading Minecraft 1.21.11 with Fabric Loader 0.19.5]]></log4j:Message>');
    parser.feed('  </log4j:Event>');
    parser.flush();

    assert.equal(lines.length, 1);
    assert.match(lines[0], /\[INFO\] \[FabricLoader\/GameProvider\]: Loading Minecraft 1.21.11 with Fabric Loader 0.19.5/);
  });

  test('passes standard non-XML log lines untouched', () => {
    const lines = [];
    const parser = createLogParser(l => lines.push(l));

    parser.feed('[18:42:15] [Render thread/INFO]: Setting user: Bameninghong9');
    parser.flush();

    assert.equal(lines.length, 1);
    assert.equal(lines[0], '[18:42:15] [Render thread/INFO]: Setting user: Bameninghong9');
  });

  test('handles multi-line messages within CDATA', () => {
    const lines = [];
    const parser = createLogParser(l => lines.push(l));

    parser.feed('<log4j:Event logger="FabricLoader" timestamp="1791394293110" level="INFO" thread="main">');
    parser.feed('  <log4j:Message><![CDATA[Loading 2 mods:');
    parser.feed('\t- bameclient 1.0.0');
    parser.feed('\t- fabric-api 0.140.2]]></log4j:Message>');
    parser.feed('</log4j:Event>');
    parser.flush();

    assert.equal(lines.length, 3);
    assert.match(lines[0], /\[INFO\] \[FabricLoader\]: Loading 2 mods:/);
    assert.equal(lines[1], '\t- bameclient 1.0.0');
    assert.equal(lines[2], '\t- fabric-api 0.140.2');
  });
});
