export type ChannelMessage = {
  role: 'interviewer' | 'system';
  text: string;
  exhibitId?: string;
};

export type CandidateMessage = { text: string };

export interface CandidateChannel {
  send(message: ChannelMessage): Promise<void>;
  receive(): Promise<CandidateMessage>;
  close(): Promise<void>;
}
