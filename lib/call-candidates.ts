// Candidate addresses stay inside the end-to-end encrypted signaling envelope.
export function candidatesFromSdp(sdp: string): RTCIceCandidateInit[] {
  const result: RTCIceCandidateInit[] = [];
  const sections = sdp.split(/(?=^m=)/m);
  let index = 0;
  for (const section of sections) {
    if (!section.startsWith("m=")) continue;
    const mid = section.match(/^a=mid:([^\r\n]+)/m)?.[1];
    for (const line of section.split(/\r?\n/)) {
      if (line.startsWith("a=candidate:"))
        result.push({
          candidate: line.slice(2),
          sdpMid: mid ?? null,
          sdpMLineIndex: index,
        });
    }
    index++;
  }
  return result;
}
