import os
from flask import Flask, render_template, jsonify, request
from dotenv import load_dotenv
from src.helpers import download_embeddings
from langchain_pinecone import PineconeVectorStore
from langchain_groq import ChatGroq
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from src.prompt import system_prompt

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Fetch API keys
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Make sure env keys are set in shell for underlying libraries
if PINECONE_API_KEY:
    os.environ["PINECONE_API_KEY"] = PINECONE_API_KEY
if GROQ_API_KEY:
    os.environ["GROQ_API_KEY"] = GROQ_API_KEY

# Global chains to hold retriever and QA models
rag_chain = None
has_groq = bool(GROQ_API_KEY)
has_pinecone = bool(PINECONE_API_KEY)

print("[System] Initializing clinical embeddings...")
try:
    embeddings = download_embeddings()
    index_name = "medical-chatbot"
    
    if PINECONE_API_KEY:
        print(f"[System] Connecting to Pinecone index: '{index_name}'...")
        docsearch = PineconeVectorStore.from_existing_index(
            embedding=embeddings,
            index_name=index_name
        )
        retriever = docsearch.as_retriever(search_type='similarity', search_kwargs={'k': 3})
    else:
        print("[Warning] PINECONE_API_KEY is missing. RAG functionality will be offline.")
        retriever = None
except Exception as e:
    print(f"[Error] Failed to connect to Pinecone: {e}")
    retriever = None
    has_pinecone = False

try:
    if GROQ_API_KEY:
        print("[System] Connecting to ChatGroq (llama-3.1-8b-instant)...")
        llm = ChatGroq(
            model="llama-3.1-8b-instant",
            temperature=0.3,
            groq_api_key=GROQ_API_KEY
        )
    else:
        print("[Warning] GROQ_API_KEY is missing. Model inference will be offline.")
        llm = None
except Exception as e:
    print(f"[Error] Failed to initialize ChatGroq: {e}")
    llm = None
    has_groq = False

# Build chain if both retriever and LLM are available
if retriever and llm:
    print("[System] Creating RAG Chain...")
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{input}"),
    ])
    question_answer_chain = create_stuff_documents_chain(llm, prompt)
    rag_chain = create_retrieval_chain(retriever, question_answer_chain)
    print("[System] RAG Pipeline stands operational.")
else:
    print("[System] Running in DEMO/MOCK fallback mode due to missing keys or initialization errors.")

@app.route("/")
def index():
    """
    Renders the clinical chatbot dashboard.
    """
    return render_template("chat.html")

@app.route("/api/status", methods=["GET"])
def system_status():
    """
    Returns API status of keys and database index presence.
    """
    return jsonify({
        "status": "online" if (has_groq and has_pinecone) else "degraded",
        "has_groq": has_groq,
        "has_pinecone": has_pinecone,
        "model": "llama-3.1-8b-instant" if has_groq else "Mock Model",
        "index_name": "medical-chatbot" if has_pinecone else "Offline"
    })

@app.route("/get", methods=["GET", "POST"])
def chat():
    """
    Core QA endpoint. Expects message parameter 'msg' via POST/GET.
    """
    try:
        user_input = None
        if request.method == "POST":
            if request.is_json:
                user_input = request.json.get("msg")
            else:
                user_input = request.form.get("msg")
        else:
            user_input = request.args.get("msg")

        if not user_input or not user_input.strip():
            return jsonify({"status": "error", "message": "No query message received."}), 400

        # Run query through RAG Chain if online
        if rag_chain:
            response = rag_chain.invoke({"input": user_input})
            answer = response.get("answer", "I could not formulate an answer.")
            context_docs = response.get("context", [])
            
            citations = []
            for doc in context_docs:
                citations.append({
                    "content": doc.page_content,
                    "source": doc.metadata.get("source", "Medical Guideline Book")
                })
                
            return jsonify({
                "status": "success",
                "answer": answer,
                "citations": citations
            })
        else:
            # Emulated RAG responses if credentials are not fully online
            demo_answer = (
                f"### Clinical Demo Note\n\n"
                f"This is an emulated response for query: **'{user_input}'**.\n\n"
                f"To fetch live answers from the PDF guidelines, ensure that `PINECONE_API_KEY` and `GROQ_API_KEY` "
                f"are loaded in the `.env` file and that you run `store_index.py` first to upload guidelines."
            )
            return jsonify({
                "status": "success",
                "answer": demo_answer,
                "citations": [
                    {
                        "source": "System Emulator",
                        "content": "Medicalbook.pdf: Emulated text placeholder. Initialize Pinecone vector store to load real guidelines."
                    }
                ]
            })
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    # Port 8080 selected to run alongside other projects
    app.run(host="0.0.0.0", port=8080, debug=True)
