// The graph stays ready, but idle audio is never retained or sent to the page.
class PronunciationMicrophone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = null;
    this.port.onmessage = ({ data }) => {
      if (data.type === "start") this.recording = data.id;
      if (data.type === "stop" && this.recording === data.id) {
        this.recording = null;
        // Port ordering ensures the page receives all preceding audio first.
        this.port.postMessage({ type: "stopped", id: data.id });
      }
    };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (this.recording !== null && input?.length) {
      const samples = input.slice();
      this.port.postMessage({ type: "audio", id: this.recording, samples }, [samples.buffer]);
    }
    // Outputs remain silent: never play microphone input through the speakers.
    return true;
  }
}

registerProcessor("pronunciation-microphone", PronunciationMicrophone);
