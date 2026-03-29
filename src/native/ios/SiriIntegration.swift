//
// SiriIntegration.swift
// AlpenglowMobile
//
// Registers Siri Intents so users can say "Hey Siri, ask [agent] to..."
// Siri handles voice. We handle the brain.
//

import Foundation
import Intents
import IntentsUI

// MARK: - Custom Intent Handler

class AlpenglowIntentHandler: INExtension {
    
    override func handler(for intent: INIntent) -> Any? {
        if intent is INSendMessageIntent {
            return SendMessageIntentHandler()
        }
        if intent is INSearchForMessagesIntent {
            return SearchMessagesIntentHandler()
        }
        return nil
    }
}

// MARK: - "Hey Siri, tell Silas to..."

class SendMessageIntentHandler: NSObject, INSendMessageIntentHandling {
    
    func handle(intent: INSendMessageIntent, completion: @escaping (INSendMessageIntentResponse) -> Void) {
        guard let content = intent.content else {
            completion(INSendMessageIntentResponse(code: .failure, userActivity: nil))
            return
        }
        
        // Route to cognitive engine
        AlpenglowBridge.shared.sendToAgent(
            message: content,
            agent: intent.recipients?.first?.displayName ?? "default"
        ) { response in
            // Agent processed the request
            let activity = NSUserActivity(activityType: "com.nousai.alpenglow.agent-response")
            activity.userInfo = ["response": response]
            completion(INSendMessageIntentResponse(code: .success, userActivity: activity))
        }
    }
    
    func resolveContent(for intent: INSendMessageIntent, with completion: @escaping (INStringResolutionResult) -> Void) {
        if let content = intent.content, !content.isEmpty {
            completion(.success(with: content))
        } else {
            completion(.needsValue())
        }
    }
    
    func resolveRecipients(for intent: INSendMessageIntent, with completion: @escaping ([INSendMessageRecipientResolutionResult]) -> Void) {
        // Default to primary agent if no recipient specified
        if let recipients = intent.recipients, !recipients.isEmpty {
            completion(recipients.map { .success(with: $0) })
        } else {
            let defaultAgent = INPerson(
                personHandle: INPersonHandle(value: "silas", type: .unknown),
                nameComponents: nil,
                displayName: "Silas",
                image: nil,
                contactIdentifier: nil,
                customIdentifier: "default-agent"
            )
            completion([.success(with: defaultAgent)])
        }
    }
}

// MARK: - "Hey Siri, ask Silas about..."

class SearchMessagesIntentHandler: NSObject, INSearchForMessagesIntentHandling {
    
    func handle(intent: INSearchForMessagesIntent, completion: @escaping (INSearchForMessagesIntentResponse) -> Void) {
        // This handles memory recall queries via Siri
        let query = intent.speakableGroupName?.spokenPhrase ?? ""
        
        AlpenglowBridge.shared.recallFromAgent(
            query: query,
            agent: "default"
        ) { results in
            let response = INSearchForMessagesIntentResponse(code: .success, userActivity: nil)
            // Convert results to INMessage format
            response.messages = results.map { result in
                INMessage(
                    identifier: result.id,
                    content: result.content,
                    dateSent: result.date,
                    sender: INPerson(
                        personHandle: INPersonHandle(value: result.agentName, type: .unknown),
                        nameComponents: nil,
                        displayName: result.agentName,
                        image: nil,
                        contactIdentifier: nil,
                        customIdentifier: result.agentId
                    ),
                    recipients: nil
                )
            }
            completion(response)
        }
    }
}

// MARK: - Bridge to Cognitive Engine

class AlpenglowBridge {
    static let shared = AlpenglowBridge()
    
    struct RecallResult {
        let id: String
        let content: String
        let date: Date
        let agentName: String
        let agentId: String
    }
    
    func sendToAgent(message: String, agent: String, completion: @escaping (String) -> Void) {
        // Call into the React Native bridge which calls the cognitive engine
        DispatchQueue.global(qos: .userInitiated).async {
            // The RN bridge exposes the agent chat endpoint
            // This calls through to the same LLM + memory pipeline as text chat
            NotificationCenter.default.post(
                name: NSNotification.Name("AlpenglowSiriRequest"),
                object: nil,
                userInfo: ["message": message, "agent": agent]
            )
            
            // Listen for response
            var observer: NSObjectProtocol?
            observer = NotificationCenter.default.addObserver(
                forName: NSNotification.Name("AlpenglowSiriResponse"),
                object: nil,
                queue: .main
            ) { notification in
                if let response = notification.userInfo?["response"] as? String {
                    completion(response)
                }
                if let observer = observer {
                    NotificationCenter.default.removeObserver(observer)
                }
            }
        }
    }
    
    func recallFromAgent(query: String, agent: String, completion: @escaping ([RecallResult]) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            NotificationCenter.default.post(
                name: NSNotification.Name("AlpenglowSiriRecall"),
                object: nil,
                userInfo: ["query": query, "agent": agent]
            )
            
            var observer: NSObjectProtocol?
            observer = NotificationCenter.default.addObserver(
                forName: NSNotification.Name("AlpenglowSiriRecallResponse"),
                object: nil,
                queue: .main
            ) { notification in
                if let results = notification.userInfo?["results"] as? [[String: Any]] {
                    let mapped = results.map { r in
                        RecallResult(
                            id: r["id"] as? String ?? "",
                            content: r["content"] as? String ?? "",
                            date: Date(),
                            agentName: r["agentName"] as? String ?? "Agent",
                            agentId: r["agentId"] as? String ?? ""
                        )
                    }
                    completion(mapped)
                }
                if let observer = observer {
                    NotificationCenter.default.removeObserver(observer)
                }
            }
        }
    }
}

// MARK: - Siri Shortcut Donation

extension AlpenglowBridge {
    /// Donate interactions to Siri so it learns to suggest them
    func donateInteraction(agentName: String, message: String) {
        let intent = INSendMessageIntent(
            recipients: [INPerson(
                personHandle: INPersonHandle(value: agentName, type: .unknown),
                nameComponents: nil,
                displayName: agentName,
                image: nil,
                contactIdentifier: nil,
                customIdentifier: "agent-\(agentName)"
            )],
            outgoingMessageType: .outgoingMessageText,
            content: message,
            speakableGroupName: nil,
            conversationIdentifier: "alpenglow-\(agentName)",
            serviceName: "Alpenglow",
            sender: nil,
            attachments: nil
        )
        
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .outgoing
        interaction.donate { error in
            if let error = error {
                print("[Siri] Donation error: \(error)")
            }
        }
    }
}
