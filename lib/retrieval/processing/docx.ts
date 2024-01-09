import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { TOKEN_LIMIT } from "."

export const processDocX = async (docX: Blob): Promise<FileItemChunk[]> => {
  const fileBuffer = Buffer.from(await docX.arrayBuffer())
  const textDecoder = new TextDecoder("utf-8")
  const textContent = textDecoder.decode(fileBuffer)

  let chunks: FileItemChunk[] = []

  let content = ""
  let tokens = 0

  // TODO: change splitter
  const textChunks = textContent.split("\n") || []

  for (let i = 0; i < textChunks.length; i++) {
    content += textChunks[i] + "\n"
    tokens += encode(textChunks[i]).length

    if (tokens >= TOKEN_LIMIT) {
      chunks.push({ content, tokens })

      content = ""
      tokens = 0
    }
  }

  if (content !== "") {
    chunks.push({ content, tokens: encode(content).length })
  }

  return chunks
}
