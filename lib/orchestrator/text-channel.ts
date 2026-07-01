import type { CandidateChannel, ChannelMessage, CandidateMessage } from './channel';

export class TextCandidateChannel implements CandidateChannel {
  private readonly candidateText: string;
  private readonly outbound: ChannelMessage[] = [];

  constructor(candidateText: string) {
    this.candidateText = candidateText;
  }

  async send(message: ChannelMessage): Promise<void> {
    this.outbound.push(message);
  }

  async receive(): Promise<CandidateMessage> {
    return { text: this.candidateText };
  }

  async close(): Promise<void> {}

  getOutbound(): ChannelMessage[] {
    return this.outbound;
  }
}
