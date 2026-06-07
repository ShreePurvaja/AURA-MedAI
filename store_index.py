from dotenv import load_dotenv
import os
import time
from pinecone import Pinecone, ServerlessSpec
from langchain_pinecone import PineconeVectorStore
from src.helpers import (
    load_pdf_files,
    filter_to_minimal_docs,
    text_split,
    download_embeddings
)





# Load environment variables
load_dotenv()

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

os.environ["PINECONE_API_KEY"] = PINECONE_API_KEY
os.environ["GROQ_API_KEY"] = GROQ_API_KEY



start = time.time()




# Load PDF documents
print("[1/8] Loading PDF documents...")
documents = load_pdf_files(data="data/")
print(f"      ✓ Loaded {len(documents)} pages")



# Remove unnecessary metadata
print("[2/8] Filtering metadata...")
minimal_docs = filter_to_minimal_docs(documents)
print(f"      ✓ Processed {len(minimal_docs)} documents")



# Split documents into chunks
print("[3/8] Splitting text...")
texts = text_split(minimal_docs)
print(f"      ✓ Generated {len(texts)} chunks")



# Load embedding model
print("[4/8] Loading embedding model...")
embeddings = download_embeddings()
print("      ✓ all-MiniLM-L6-v2 loaded")



# Connect to Pinecone
print("[5/8] Connecting to Pinecone...")
pc = Pinecone(api_key=PINECONE_API_KEY)
print("      ✓ Connection established")



# Verify Pinecone index
print("[6/8] Validating index...")

index_name = "medical-chatbot"

existing_indexes = pc.list_indexes().names()

if index_name not in existing_indexes:

    print(f"      → Creating '{index_name}'")

    pc.create_index(
        name=index_name,
        dimension=384,
        metric="cosine",
        spec=ServerlessSpec(
            cloud="aws",
            region="us-east-1"
        )
    )

    print("      ✓ Index created")

else:

    print(
        f"      ✓ Using existing index '{index_name}'"
    )




# Connect to Pinecone index
print("[7/8] Connecting to index...")

index = pc.Index(index_name)

print("      ✓ Index connection successful")




# Generate embeddings and upload to Pinecone
print("[8/8] Uploading document embeddings...")

docsearch = PineconeVectorStore.from_documents(
    documents=texts,
    embedding=embeddings,
    index_name=index_name
)

print(f"      ✓ Uploaded {len(texts)} chunks")

print("\nPipeline completed successfully")
print(
    f"Execution Time : {time.time() - start:.2f} seconds"
)