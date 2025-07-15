const fs = require('fs').promises;
const path = require('path');
const yaml = require('yaml');
const glob = require('glob');
const crypto = require('crypto');
require('dotenv').config();

// Paths
const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const CLASSIFICATIONS_FILE = path.join(__dirname, '../data/classifications.yaml');
const PREFERENCES_FILE = path.join(__dirname, '../data/preferences.json');
const REFLECTIONS_DIR = path.join(__dirname, '../reflections');
const VECTORSTORE_DIR = path.join(__dirname, '../vectorstore');
const KNOWLEDGE_DIR = path.join(__dirname, '../_knowledge');

// Simple vector store implementation (fallback for when FAISS isn't available)
class SimpleVectorStore {
  constructor() {
    this.chunks = [];
    this.embeddings = [];
    this.metadata = [];
  }

  async addChunk(chunk, embedding, metadata) {
    this.chunks.push(chunk);
    this.embeddings.push(embedding);
    this.metadata.push(metadata);
  }

  async save(filePath) {
    const data = {
      chunks: this.chunks,
      embeddings: this.embeddings,
      metadata: this.metadata,
      timestamp: new Date().toISOString()
    };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async load(filePath) {
    try {
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      this.chunks = data.chunks || [];
      this.embeddings = data.embeddings || [];
      this.metadata = data.metadata || [];
      return true;
    } catch (error) {
      console.log('No existing vector store found, creating new one');
      return false;
    }
  }

  async search(queryEmbedding, k = 5) {
    if (this.embeddings.length === 0) {return [];}

    const similarities = this.embeddings.map((embedding, index) => ({
      index,
      similarity: this.cosineSimilarity(queryEmbedding, embedding)
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)
      .map(item => ({
        chunk: this.chunks[item.index],
        metadata: this.metadata[item.index],
        similarity: item.similarity
      }));
  }

  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// Simple embedding function (TF-IDF based)
class SimpleEmbedder {
  constructor() {
    this.vocabulary = new Map();
    this.idf = new Map();
  }

  tokenize(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  buildVocabulary(documents) {
    const docFreq = new Map();
    
    documents.forEach(doc => {
      const tokens = new Set(this.tokenize(doc));
      tokens.forEach(token => {
        this.vocabulary.set(token, (this.vocabulary.get(token) || 0) + 1);
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      });
    });

    // Calculate IDF
    const totalDocs = documents.length;
    this.vocabulary.forEach((_, token) => {
      this.idf.set(token, Math.log(totalDocs / (docFreq.get(token) || 1)));
    });

    // Keep only top 1000 most frequent terms
    const sortedTerms = Array.from(this.vocabulary.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1000);

    this.vocabulary.clear();
    sortedTerms.forEach(([token, freq], index) => {
      this.vocabulary.set(token, index);
    });
  }

  embed(text) {
    const tokens = this.tokenize(text);
    const vector = new Array(this.vocabulary.size).fill(0);
    
    tokens.forEach(token => {
      const index = this.vocabulary.get(token);
      if (index !== undefined) {
        vector[index] += this.idf.get(token) || 0;
      }
    });

    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }
}

// Chunking functions
function chunkText(text, maxLength = 500, overlap = 50) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Add overlap from previous chunk
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 6)); // Rough word count
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += sentence + '. ';
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

function createBookChunk(book) {
  const parts = [];
  
  parts.push(`Title: ${book.title}`);
  if (book.author_name) {parts.push(`Author: ${book.author_name}`);}
  if (book.series_name) {parts.push(`Series: ${book.series_name} #${book.series_number}`);}
  if (book.genre) {parts.push(`Genre: ${book.genre}`);}
  if (book.subgenre) {parts.push(`Subgenre: ${book.subgenre}`);}
  if (book.tropes && book.tropes.length > 0) {parts.push(`Tropes: ${book.tropes.join(', ')}`);}
  if (book.status) {parts.push(`Status: ${book.status}`);}
  if (book.liked !== null) {parts.push(`Liked: ${book.liked}`);}
  if (book.notes) {parts.push(`Notes: ${book.notes}`);}
  if (book.book_description) {parts.push(`Description: ${book.book_description}`);}
  
  return parts.join('\n');
}

async function readBooksData() {
  try {
    const data = await fs.readFile(BOOKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('No books.json found, using empty array');
    return [];
  }
}

async function readClassificationsData() {
  try {
    const data = await fs.readFile(CLASSIFICATIONS_FILE, 'utf-8');
    return yaml.parse(data);
  } catch (error) {
    console.log('No classifications.yaml found, using empty object');
    return {};
  }
}

async function readPreferencesData() {
  try {
    const data = await fs.readFile(PREFERENCES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('No preferences.json found, using empty object');
    return {};
  }
}

async function readReflectionFiles() {
  try {
    const pattern = path.join(REFLECTIONS_DIR, '**/*.md');
    const files = glob.sync(pattern);
    
    const reflections = [];
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      reflections.push({
        file: path.relative(REFLECTIONS_DIR, file),
        content
      });
    }
    return reflections;
  } catch (error) {
    console.log('No reflections directory found, using empty array');
    return [];
  }
}

async function readKnowledgeFiles() {
  try {
    const pattern = path.join(KNOWLEDGE_DIR, '**/*.md');
    const files = glob.sync(pattern);
    
    const knowledge = [];
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      knowledge.push({
        file: path.relative(KNOWLEDGE_DIR, file),
        content
      });
    }
    return knowledge;
  } catch (error) {
    console.log('No knowledge directory found, using empty array');
    return [];
  }
}

async function ingestData() {
  console.log('Starting RAG ingestion...');
  
  try {
    // Ensure vectorstore directory exists
    await fs.mkdir(VECTORSTORE_DIR, { recursive: true });
    
    // Read all data sources
    const [books, classifications, preferences, reflections, knowledge] = await Promise.all([
      readBooksData(),
      readClassificationsData(), 
      readPreferencesData(),
      readReflectionFiles(),
      readKnowledgeFiles()
    ]);
    
    console.log(`Found ${books.length} books, ${reflections.length} reflections, ${knowledge.length} knowledge files`);
    
    // Prepare documents for embedding
    const documents = [];
    const chunks = [];
    
    // Process books
    books.forEach(book => {
      const bookChunk = createBookChunk(book);
      documents.push(bookChunk);
      chunks.push({
        content: bookChunk,
        type: 'book',
        id: book.goodreads_id || book.guid,
        metadata: {
          title: book.title,
          author: book.author_name,
          status: book.status,
          source: 'books.json'
        }
      });
    });
    
    // Process classifications
    if (Object.keys(classifications).length > 0) {
      const classificationText = yaml.stringify(classifications);
      const classificationChunks = chunkText(classificationText, 300);
      
      classificationChunks.forEach((chunk, index) => {
        documents.push(chunk);
        chunks.push({
          content: chunk,
          type: 'classification',
          id: `classification_${index}`,
          metadata: {
            source: 'classifications.yaml',
            chunk_index: index
          }
        });
      });
    }
    
    // Process preferences
    if (Object.keys(preferences).length > 0) {
      const preferencesText = JSON.stringify(preferences, null, 2);
      documents.push(preferencesText);
      chunks.push({
        content: preferencesText,
        type: 'preferences',
        id: 'preferences',
        metadata: {
          source: 'preferences.json'
        }
      });
    }
    
    // Process reflections
    reflections.forEach(reflection => {
      const reflectionChunks = chunkText(reflection.content, 400);
      
      reflectionChunks.forEach((chunk, index) => {
        documents.push(chunk);
        chunks.push({
          content: chunk,
          type: 'reflection',
          id: `${reflection.file}_${index}`,
          metadata: {
            source: `reflections/${reflection.file}`,
            chunk_index: index
          }
        });
      });
    });
    
    // Process knowledge files
    knowledge.forEach(knowledgeFile => {
      const knowledgeChunks = chunkText(knowledgeFile.content, 400);
      
      knowledgeChunks.forEach((chunk, index) => {
        documents.push(chunk);
        chunks.push({
          content: chunk,
          type: 'knowledge',
          id: `${knowledgeFile.file}_${index}`,
          metadata: {
            source: `_knowledge/${knowledgeFile.file}`,
            chunk_index: index
          }
        });
      });
    });
    
    console.log(`Created ${chunks.length} chunks from ${documents.length} documents`);
    
    // Build embeddings
    const embedder = new SimpleEmbedder();
    embedder.buildVocabulary(documents);
    
    console.log(`Built vocabulary with ${embedder.vocabulary.size} terms`);
    
    // Create vector store
    const vectorStore = new SimpleVectorStore();
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embedder.embed(chunk.content);
      await vectorStore.addChunk(chunk.content, embedding, chunk.metadata);
    }
    
    // Save vector store
    const indexPath = path.join(VECTORSTORE_DIR, 'index.json');
    await vectorStore.save(indexPath);
    
    // Save embedder vocabulary
    const vocabPath = path.join(VECTORSTORE_DIR, 'vocabulary.json');
    await fs.writeFile(vocabPath, JSON.stringify({
      vocabulary: Array.from(embedder.vocabulary.entries()),
      idf: Array.from(embedder.idf.entries())
    }, null, 2));
    
    // Create metadata file
    const metadataPath = path.join(VECTORSTORE_DIR, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify({
      created_at: new Date().toISOString(),
      total_chunks: chunks.length,
      total_documents: documents.length,
      sources: {
        books: books.length,
        reflections: reflections.length,
        knowledge: knowledge.length,
        classifications: Object.keys(classifications).length > 0 ? 1 : 0,
        preferences: Object.keys(preferences).length > 0 ? 1 : 0
      }
    }, null, 2));
    
    console.log('RAG ingestion completed successfully');
    console.log(`- Created ${chunks.length} chunks`);
    console.log(`- Built vocabulary with ${embedder.vocabulary.size} terms`);
    console.log(`- Saved index to ${indexPath}`);
    
    return {
      success: true,
      chunks: chunks.length,
      documents: documents.length,
      vocabularySize: embedder.vocabulary.size
    };
    
  } catch (error) {
    console.error('RAG ingestion failed:', error);
    throw error;
  }
}

// Rebuild function
async function rebuild() {
  console.log('Rebuilding RAG index...');
  
  try {
    // Clean vectorstore directory
    try {
      const files = await fs.readdir(VECTORSTORE_DIR);
      for (const file of files) {
        await fs.unlink(path.join(VECTORSTORE_DIR, file));
      }
    } catch (error) {
      // Directory doesn't exist, that's fine
    }
    
    // Run ingestion
    return await ingestData();
    
  } catch (error) {
    console.error('RAG rebuild failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'rebuild') {
    rebuild()
      .then(result => {
        console.log('RAG rebuild completed successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('RAG rebuild failed:', error);
        process.exit(1);
      });
  } else {
    ingestData()
      .then(result => {
        console.log('RAG ingestion completed successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('RAG ingestion failed:', error);
        process.exit(1);
      });
  }
}

module.exports = { ingestData, rebuild, SimpleVectorStore, SimpleEmbedder };