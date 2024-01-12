import { ChatbotUIContext } from "@/context/context"
import { deleteMessagesIncludingAndAfter } from "@/db/messages"
import { Tables } from "@/supabase/types"
import { ChatMessage, ChatPayload } from "@/types"
import { useRouter } from "next/navigation"
import { useContext, useRef } from "react"
import { LLM_LIST } from "../../../lib/models/llm/llm-list"
import {
  createTempMessages,
  handleCreateChat,
  handleCreateMessages,
  handleHostedChat,
  handleLocalChat,
  handleRetrieval,
  validateChatSettings
} from "../chat-helpers"

export const useChatHandler = () => {
  const {
    userInput,
    chatFiles,
    setUserInput,
    setNewMessageImages,
    profile,
    setIsGenerating,
    setChatMessages,
    setFirstTokenReceived,
    selectedChat,
    selectedWorkspace,
    setSelectedChat,
    setChats,
    availableLocalModels,
    abortController,
    setAbortController,
    chatSettings,
    newMessageImages,
    selectedAssistant,
    chatMessages,
    chatImages,
    setChatImages,
    setChatFiles,
    setNewMessageFiles,
    setShowFilesDisplay,
    newMessageFiles,
    chatFileItems,
    setChatFileItems,
    setToolInUse,
    useRetrieval,
    sourceCount
  } = useContext(ChatbotUIContext)

  const router = useRouter()

  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  const handleNewChat = () => {
    setUserInput("")
    setChatMessages([])
    setSelectedChat(null)
    setChatFileItems([])

    setIsGenerating(false)
    setFirstTokenReceived(false)

    setChatFiles([])
    setChatImages([])
    setNewMessageFiles([])
    setNewMessageImages([])
    setShowFilesDisplay(false)

    router.push("/chat")
  }

  const handleFocusChatInput = () => {
    chatInputRef.current?.focus()
  }

  const handleStopMessage = () => {
    if (abortController) {
      abortController.abort()
    }
  }

  const handleSendMessage = async (
    messageContent: string,
    chatMessages: ChatMessage[],
    isRegeneration: boolean
  ) => {
    setIsGenerating(true)

    const newAbortController = new AbortController()
    setAbortController(newAbortController)

    const modelData = [...LLM_LIST, ...availableLocalModels].find(
      llm => llm.modelId === chatSettings?.model
    )

    try {
      validateChatSettings(
        chatSettings,
        modelData,
        profile,
        selectedWorkspace,
        messageContent
      )
    } catch (error) {
      setIsGenerating(false)
      return
    }

    let currentChat = selectedChat ? { ...selectedChat } : null

    const b64Images = newMessageImages.map(image => image.base64)

    let retrievedFileItems: Tables<"file_items">[] = []

    if ((newMessageFiles.length > 0 || chatFiles.length > 0) && useRetrieval) {
      setToolInUse("retrieval")

      retrievedFileItems = await handleRetrieval(
        userInput,
        newMessageFiles,
        chatFiles,
        chatSettings!.embeddingsProvider,
        sourceCount
      )
    }

    const { tempUserChatMessage, tempAssistantChatMessage } =
      createTempMessages(
        messageContent,
        chatMessages,
        chatSettings!,
        b64Images,
        isRegeneration,
        setChatMessages
      )

    const payload: ChatPayload = {
      chatSettings: chatSettings!,
      workspaceInstructions: selectedWorkspace!.instructions || "",
      chatMessages: isRegeneration
        ? [...chatMessages]
        : [...chatMessages, tempUserChatMessage],
      assistant: selectedChat?.assistant_id ? selectedAssistant : null,
      messageFileItems: retrievedFileItems,
      chatFileItems: chatFileItems
    }

    let generatedText = ""

    if (modelData!.provider === "ollama") {
      generatedText = await handleLocalChat(
        payload,
        profile!,
        chatSettings!,
        tempAssistantChatMessage,
        isRegeneration,
        newAbortController,
        setIsGenerating,
        setFirstTokenReceived,
        setChatMessages,
        setToolInUse
      )
    } else {
      generatedText = await handleHostedChat(
        payload,
        profile!,
        modelData!,
        tempAssistantChatMessage,
        isRegeneration,
        newAbortController,
        newMessageImages,
        chatImages,
        setIsGenerating,
        setFirstTokenReceived,
        setChatMessages,
        setToolInUse
      )
    }

    if (!currentChat) {
      currentChat = await handleCreateChat(
        chatSettings!,
        profile!,
        selectedWorkspace!,
        messageContent,
        selectedAssistant!,
        newMessageFiles,
        setSelectedChat,
        setChats,
        setChatFiles
      )
    }

    if (!currentChat) {
      throw new Error("Chat not found")
    }

    await handleCreateMessages(
      chatMessages,
      currentChat,
      profile!,
      modelData!,
      messageContent,
      generatedText,
      newMessageImages,
      isRegeneration,
      retrievedFileItems,
      setChatMessages,
      setChatFileItems,
      setChatImages
    )

    setIsGenerating(false)
    setFirstTokenReceived(false)
    setUserInput("")
    setNewMessageImages([])
  }

  const handleSendEdit = async (
    editedContent: string,
    sequenceNumber: number
  ) => {
    if (!selectedChat) return

    await deleteMessagesIncludingAndAfter(
      selectedChat.user_id,
      selectedChat.id,
      sequenceNumber
    )

    const filteredMessages = chatMessages.filter(
      chatMessage => chatMessage.message.sequence_number < sequenceNumber
    )

    setChatMessages(filteredMessages)

    handleSendMessage(editedContent, filteredMessages, false)
  }

  return {
    chatInputRef,
    prompt,
    handleNewChat,
    handleSendMessage,
    handleFocusChatInput,
    handleStopMessage,
    handleSendEdit
  }
}
