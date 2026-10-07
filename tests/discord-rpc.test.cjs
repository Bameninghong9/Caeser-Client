const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DiscordRpcClient } = require('../src/shared/discord-rpc.cjs');

describe('Discord RPC Client', () => {
  test('encodes opcode and payload into standard buffer', () => {
    const client = new DiscordRpcClient();
    const packet = client.encode(0, { v: 1, client_id: '123' });
    assert.equal(packet.readInt32LE(0), 0); // Opcode 0
    const len = packet.readInt32LE(4);
    assert.ok(len > 0);
    const body = JSON.parse(packet.subarray(8, 8 + len).toString());
    assert.equal(body.client_id, '123');
  });

  test('encodes frame opcode 1 correctly', () => {
    const client = new DiscordRpcClient();
    const packet = client.encode(1, { cmd: 'SET_ACTIVITY' });
    assert.equal(packet.readInt32LE(0), 1);
    const len = packet.readInt32LE(4);
    const body = JSON.parse(packet.subarray(8, 8 + len).toString());
    assert.equal(body.cmd, 'SET_ACTIVITY');
  });

  test('toggles enabled state properly', () => {
    const client = new DiscordRpcClient();
    assert.equal(client.enabled, true);
    client.setEnabled(false);
    assert.equal(client.enabled, false);
    client.destroy();
  });
});
