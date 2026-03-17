/**
 * Root component for the Backup Viewer.
 *
 * Manages navigation between backup list → conversation list → conversation detail.
 */

import { useState } from "react";
import { BackupList } from "./BackupList";
import { ConversationDetail } from "./ConversationDetail";
import { ConversationList } from "./ConversationList";

export function BackupViewer() {
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("");

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

  // Level 2: Conversation list within a backup
  if (selectedBackup) {
    return (
      <ConversationList
        backupId={selectedBackup}
        onSelect={handleSelectConversation}
        onBack={handleBackToBackups}
      />
    );
  }

  // Level 1: Backup list
  return <BackupList onSelect={setSelectedBackup} />;
}
