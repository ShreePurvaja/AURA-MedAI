document.addEventListener("DOMContentLoaded", () => {
    
    // ================= STATE VARIABLES =================
    let systemOnline = false;
    let activeCitations = [];

    // ================= DOM ELEMENTS =================
    // Sidebar Status
    const ledGroq = document.getElementById("led-groq");
    const lblGroq = document.getElementById("lbl-groq");
    const ledPinecone = document.getElementById("led-pinecone");
    const lblPinecone = document.getElementById("lbl-pinecone");
    const chatModeBadge = document.getElementById("chat-mode-badge");

    // Chat Log & Form
    const messagesContainer = document.getElementById("messages-container");
    const chatInput = document.getElementById("chat-input");
    const btnSend = document.getElementById("btn-send");
    const btnClear = document.getElementById("btn-clear");

    // Citations Panel
    const citationsContainer = document.getElementById("citations-container");

    // Modal Details
    const citeModal = document.getElementById("cite-modal");
    const btnCloseModal = document.getElementById("btn-close-modal");
    const modalTag = document.getElementById("modal-tag");
    const modalTitle = document.getElementById("modal-title");
    const modalText = document.getElementById("modal-text");

    // ================= SYSTEM INITIALIZATION =================
    async function loadSystemStatus() {
        try {
            const res = await fetch("/api/status");
            const data = await res.json();
            
            // Toggle Groq Status Indicator
            if (data.has_groq) {
                ledGroq.className = "status-led led-online";
                lblGroq.textContent = "Operational";
                lblGroq.style.color = "var(--color-success)";
            } else {
                ledGroq.className = "status-led led-offline";
                lblGroq.textContent = "Offline / Demo";
                lblGroq.style.color = "var(--color-warning)";
            }

            // Toggle Pinecone Status Indicator
            if (data.has_pinecone) {
                ledPinecone.className = "status-led led-online";
                lblPinecone.textContent = "Operational";
                lblPinecone.style.color = "var(--color-success)";
            } else {
                ledPinecone.className = "status-led led-offline";
                lblPinecone.textContent = "Offline / Demo";
                lblPinecone.style.color = "var(--color-warning)";
            }

            // Update Header Status Badge
            if (data.has_groq && data.has_pinecone) {
                chatModeBadge.className = "badge online";
                chatModeBadge.innerHTML = `<i class="fa-solid fa-server"></i> Pinecone RAG Online`;
                systemOnline = true;
            } else {
                chatModeBadge.className = "badge";
                chatModeBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> RAG Pipeline Offline`;
                systemOnline = false;
            }
        } catch (err) {
            console.error("[AURA Error] Could not fetch system configuration status:", err);
        }
    }

    // ================= CHAT LOG OPERATIONS =================
    // Auto-expanding textarea input height adjustments
    chatInput.addEventListener("input", () => {
        btnSend.disabled = !chatInput.value.trim();
        chatInput.style.height = "auto";
        chatInput.style.height = (chatInput.scrollHeight - 4) + "px";
    });

    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && chatInput.value.trim() && !btnSend.disabled) {
            e.preventDefault();
            sendMessage();
        }
    });

    btnSend.addEventListener("click", sendMessage);

    async function sendMessage(overrideText = null) {
        const text = overrideText ? overrideText.trim() : chatInput.value.trim();
        if (!text) return;

        // Clean UI Welcome Card on first message
        const welcomeCard = messagesContainer.querySelector(".welcome-card");
        if (welcomeCard) {
            welcomeCard.style.display = "none";
        }

        // 1. Add User message bubble to view
        appendMessage("user", text);
        if (!overrideText) {
            chatInput.value = "";
            btnSend.disabled = true;
            chatInput.style.height = "24px";
        }

        // 2. Add AI typing indicator bubble
        const typingIndicatorId = appendTypingIndicator();
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            // 3. Post user query to Flask backend RAG system
            const response = await fetch("/get", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ msg: text })
            });

            const data = await response.json();
            
            // Remove typing bubble
            removeTypingIndicator(typingIndicatorId);

            if (data.status === "success" || data.answer) {
                // 4. Render output message
                appendMessage("assistant", data.answer);
                
                // 5. Update right citations sidepanel
                renderCitations(data.citations);
            } else {
                appendMessage("assistant", `I apologize, but I encountered an execution error: ${data.message || "Unknown error occurred"}`);
            }
        } catch (err) {
            console.error("[AURA Error] Communication failure:", err);
            removeTypingIndicator(typingIndicatorId);
            appendMessage("assistant", "System Connection Failure. Please verify that the Flask server backend is active.");
        }

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function appendMessage(role, text) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${role}`;

        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.innerHTML = role === "user"
            ? `<i class="fa-solid fa-user"></i>`
            : `<i class="fa-solid fa-user-doctor"></i>`;

        const content = document.createElement("div");
        content.className = "message-content";
        content.innerHTML = formatMedicalMarkdown(text);

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(content);
        messagesContainer.appendChild(msgDiv);
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function appendTypingIndicator() {
        const id = "typing-" + Date.now();
        const msgDiv = document.createElement("div");
        msgDiv.className = "message assistant";
        msgDiv.id = id;

        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.innerHTML = `<i class="fa-solid fa-user-doctor"></i>`;

        const content = document.createElement("div");
        content.className = "message-content";
        content.innerHTML = `
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(content);
        messagesContainer.appendChild(msgDiv);
        return id;
    }

    function removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // Dynamic medical markdown cleaner
    function formatMedicalMarkdown(text) {
        if (!text) return "";
        
        // Escape standard HTML injection
        let output = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
            
        // Bold formatting (**text**)
        output = output.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        
        // Italic formatting (*text*)
        output = output.replace(/\*(.*?)\*/g, "<em>$1</em>");
        
        // Split text into lines to process list styles
        const lines = output.split("\n");
        let listActive = false;
        let formattedLines = [];
        
        for (let line of lines) {
            let trimmed = line.trim();
            if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
                if (!listActive) {
                    formattedLines.push("<ul>");
                    listActive = true;
                }
                formattedLines.push(`<li>${trimmed.substring(2)}</li>`);
            } else {
                if (listActive) {
                    formattedLines.push("</ul>");
                    listActive = false;
                }
                
                if (trimmed !== "") {
                    // Highlight clinical disclaimers
                    if (trimmed.toLowerCase().includes("disclaimer:") || trimmed.toLowerCase().includes("warning:")) {
                        formattedLines.push(`<div class="disclaimer-block">${line}</div>`);
                    } else {
                        formattedLines.push(`<p>${line}</p>`);
                    }
                }
            }
        }
        
        if (listActive) {
            formattedLines.push("</ul>");
        }
        
        return formattedLines.join("\n");
    }

    // ================= CITATION MANAGEMENT =================
    function renderCitations(citations) {
        activeCitations = citations || [];
        citationsContainer.innerHTML = "";

        if (activeCitations.length === 0) {
            citationsContainer.innerHTML = `
                <div class="citation-empty-state">
                    <i class="fa-solid fa-server-dns"></i>
                    <p>Retrieve medical guidance answers to display reference books and pages here.</p>
                </div>
            `;
            return;
        }

        activeCitations.forEach((cite, idx) => {
            const card = document.createElement("div");
            card.className = "citation-card";
            
            // Clean up source path names (e.g. data\Medical_book.pdf -> Medical_book.pdf)
            let fileTitle = cite.source || "Clinical Reference";
            if (fileTitle.includes("\\")) {
                fileTitle = fileTitle.substring(fileTitle.lastIndexOf("\\") + 1);
            } else if (fileTitle.includes("/")) {
                fileTitle = fileTitle.substring(fileTitle.lastIndexOf("/") + 1);
            }

            card.innerHTML = `
                <div class="citation-card-meta">
                    <span class="citation-card-title">${fileTitle}</span>
                    <span class="citation-card-index">REF #${idx + 1}</span>
                </div>
                <div class="citation-card-snippet">${cite.content}</div>
            `;
            
            card.addEventListener("click", () => openCitationModal(idx));
            citationsContainer.appendChild(card);
        });
    }

    function openCitationModal(idx) {
        const cite = activeCitations[idx];
        if (!cite) return;

        let fileTitle = cite.source || "Clinical Reference";
        if (fileTitle.includes("\\")) {
            fileTitle = fileTitle.substring(fileTitle.lastIndexOf("\\") + 1);
        } else if (fileTitle.includes("/")) {
            fileTitle = fileTitle.substring(fileTitle.lastIndexOf("/") + 1);
        }

        modalTag.textContent = `Reference Document #${idx + 1}`;
        modalTitle.textContent = fileTitle;
        modalText.textContent = cite.content;

        citeModal.classList.add("active");
    }

    // Close Modal overlays
    btnCloseModal.addEventListener("click", () => {
        citeModal.classList.remove("active");
    });

    window.addEventListener("click", (e) => {
        if (e.target === citeModal) {
            citeModal.classList.remove("active");
        }
    });

    // ================= INTERACTIVE COMPONENT polish =================
    // Suggested query tag listener
    document.querySelectorAll(".suggestion-tag").forEach(tag => {
        tag.addEventListener("click", () => {
            const text = tag.textContent;
            sendMessage(text);
        });
    });

    // Clear Consultation history
    btnClear.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear this consultation log history?")) {
            // Clear message log
            const welcomeCard = messagesContainer.querySelector(".welcome-card");
            messagesContainer.innerHTML = "";
            if (welcomeCard) {
                welcomeCard.style.display = "flex";
                messagesContainer.appendChild(welcomeCard);
            } else {
                // Re-create the welcome card if removed
                location.reload();
            }
            // Reset references
            renderCitations([]);
        }
    });



    // Initialize System checks
    loadSystemStatus();
});
