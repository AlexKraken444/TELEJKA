import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatesFromSdp } from "../lib/call-candidates";
test("late ICE candidates retain their media section and MID", () => {
  const sdp =
    "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:voice\r\na=candidate:1 1 udp 1 192.0.2.1 9000 typ host\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:camera\r\na=candidate:2 1 udp 1 192.0.2.2 9001 typ srflx\r\n";
  assert.deepEqual(
    candidatesFromSdp(sdp).map((c) => [c.sdpMid, c.sdpMLineIndex]),
    [
      ["voice", 0],
      ["camera", 1],
    ],
  );
  assert.equal(candidatesFromSdp("v=0\r\n").length, 0);
});
