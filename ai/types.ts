export interface AIResponse {
  success: boolean;
  content: string;
  provider: string;
  error?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
