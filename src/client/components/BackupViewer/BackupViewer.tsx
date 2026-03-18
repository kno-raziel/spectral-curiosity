/**
 * Root component for the Backup Viewer.
 *
 * Manages navigation between:
 *   Backup list → Conversation list → Conversation detail
 *   Backup list → Knowledge Base
 */

import { useState } from "react";
import { BackupList } from "./BackupList";
import { ConversationDetail } from "./ConversationDetail";
import { ConversationList } from "./ConversationList";
import { KnowledgeBase } from "./KnowledgeBase";

type ViewMode = "conversations" | "knowledge";

export function BackupViewer() {
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("conversations");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("");

  const handleSelectBackup = (backupId: string) => {
    setSelectedBackup(backupId);
    setViewMode("conversations");
  };

  const handleSelectConversation = (convId: string, title: string) => {
    setSelectedConversation(convId);
    setConversationTitle(title);
  };

  const handleBackToList = () => {
    setSelectedConversation(null);
    setConversationTitle("");
  };

  const handleBackToBackups = () => {
    setSelectedBackup(null);
    setSelectedConversation(null);
    setConversationTitle("");
    setViewMode("conversations");
  };

  // Level 3: Conversation detail
  if (selectedBackup && selectedConversation) {
    return (
      <ConversationDetail
        backupId={selectedBackup}
        conversationId={selectedConversation}
        title={conversationTitle}
        onBack={handleBackToList}
      />
    );
  }

  // Level 2b: Knowledge Base
  if (selectedBackup && viewMode === "knowledge") {
    return <KnowledgeBase backupId={selectedBackup} onBack={handleBackToBackups} />;
  }

  // Level 2a: Conversation list within a backup
  if (selectedBackup) {
    return (
      <div>
        {/* Sub-nav tabs */}
        <div className="flex gap-1 mb-4 bg-bg-secondary rounded-lg p-1 w-fit border border-border">
          {(["conversations", "knowledge"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all cursor-pointer border-none font-sans ${
                viewMode === m
                  ? "bg-accent-blue text-white shadow-sm"
                  : "bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              {m === "conversations" ? "💬 Conversations" : "📚 Knowledge Base"}
            </button>
          ))}
        </div>
        <ConversationList
          backupId={selectedBackup}
          onSelect={handleSelectConversation}
          onBack={handleBackToBackups}
        />
      </div>
    );
  }

  // Level 1: Backup list
  return <BackupList onSelect={handleSelectBackup} />;
}
