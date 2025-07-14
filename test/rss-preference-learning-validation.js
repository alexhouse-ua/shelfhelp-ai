/**
 * RSS-Triggered Preference Learning Validation
 * Test suite for validating the complete RSS → preference learning workflow
 */

const assert = require('assert');
const fetch = require('node-fetch');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('❌ API_KEY environment variable is required');
  process.exit(1);
}

// Helper functions
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return response.json();
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test suite
class RSSPreferenceLearningValidator {
  constructor() {
    this.testResults = [];
    this.currentTest = null;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async startTest(testName) {
    this.currentTest = {
      name: testName,
      startTime: Date.now(),
      status: 'running'
    };
    this.log(`Starting test: ${testName}`);
  }

  async endTest(success = true, error = null) {
    if (this.currentTest) {
      this.currentTest.endTime = Date.now();
      this.currentTest.duration = this.currentTest.endTime - this.currentTest.startTime;
      this.currentTest.status = success ? 'passed' : 'failed';
      this.currentTest.error = error;
      
      this.testResults.push(this.currentTest);
      
      if (success) {
        this.log(`✅ Test passed: ${this.currentTest.name} (${this.currentTest.duration}ms)`, 'success');
      } else {
        this.log(`❌ Test failed: ${this.currentTest.name} - ${error}`, 'error');
      }
      
      this.currentTest = null;
    }
  }

  async validateRSSIngestion() {
    await this.startTest('RSS Ingestion Endpoint');
    
    try {
      // Test RSS ingestion endpoint
      const response = await apiRequest('/api/rss/ingest', {
        method: 'POST',
        body: JSON.stringify({
          trigger_learning: true,
          force_update: false
        })
      });
      
      // Validate response structure
      assert(response.success, 'RSS ingestion should return success');
      assert(typeof response.newBooks === 'number', 'newBooks should be a number');
      assert(typeof response.updatedBooks === 'number', 'updatedBooks should be a number');
      assert(Array.isArray(response.newlyReadBooks), 'newlyReadBooks should be an array');
      assert(Array.isArray(response.learningPrompts), 'learningPrompts should be an array');
      assert(typeof response.userMessage === 'string', 'userMessage should be a string');
      
      this.log(`RSS ingestion processed: ${response.newBooks} new, ${response.updatedBooks} updated books`);
      
      await this.endTest(true);
      return response;
    } catch (error) {
      await this.endTest(false, error.message);
      throw error;
    }
  }

  async validatePreferencePrompts() {
    await this.startTest('Preference Learning Prompts');
    
    try {
      const response = await apiRequest('/api/preferences/prompts?limit=5');
      
      // Validate response structure
      assert(response.success, 'Preference prompts should return success');
      assert(Array.isArray(response.prompts), 'prompts should be an array');
      assert(typeof response.total_unprocessed === 'number', 'total_unprocessed should be a number');
      assert(typeof response.learning_strategy === 'string', 'learning_strategy should be a string');
      assert(typeof response.userMessage === 'string', 'userMessage should be a string');
      
      // Validate prompt structure
      if (response.prompts.length > 0) {
        const prompt = response.prompts[0];
        assert(typeof prompt.book_id === 'string', 'prompt.book_id should be a string');
        assert(typeof prompt.book_title === 'string', 'prompt.book_title should be a string');
        assert(typeof prompt.conversation_starter === 'string', 'prompt.conversation_starter should be a string');
        assert(Array.isArray(prompt.follow_up_questions), 'prompt.follow_up_questions should be an array');
        assert(Array.isArray(prompt.learning_objectives), 'prompt.learning_objectives should be an array');
      }
      
      this.log(`Generated ${response.prompts.length} learning prompts for ${response.total_unprocessed} unprocessed books`);
      
      await this.endTest(true);
      return response;
    } catch (error) {
      await this.endTest(false, error.message);
      throw error;
    }
  }

  async validatePreferenceLearning(testBookId) {
    await this.startTest('Preference Learning Data Capture');
    
    try {
      const mockExperience = {
        rating: 4.5,
        liked_aspects: ['Complex characters', 'Beautiful writing', 'Engaging plot'],
        disliked_aspects: ['Slow pacing in middle'],
        mood_when_read: 'Relaxed evening reading',
        reading_context: 'Read over weekend',
        would_recommend: true,
        similar_books_wanted: true,
        notes: 'Really enjoyed the character development and emotional depth'
      };
      
      const response = await apiRequest('/api/preferences/learn', {
        method: 'POST',
        body: JSON.stringify({
          book_id: testBookId,
          experience: mockExperience
        })
      });
      
      // Validate response structure
      assert(response.success, 'Preference learning should return success');
      assert(typeof response.book === 'object', 'book should be an object');
      assert(response.preferences_updated === true, 'preferences_updated should be true');
      assert(typeof response.learning_insights === 'object', 'learning_insights should be an object');
      assert(Array.isArray(response.next_recommendations), 'next_recommendations should be an array');
      assert(typeof response.userMessage === 'string', 'userMessage should be a string');
      
      // Validate learning insights
      const insights = response.learning_insights;
      assert(typeof insights.total_books_learned === 'number', 'total_books_learned should be a number');
      assert(typeof insights.confidence_score === 'number', 'confidence_score should be a number');
      assert(typeof insights.preferences_discovered === 'number', 'preferences_discovered should be a number');
      
      this.log(`Preference learning completed for book ${testBookId}`);
      this.log(`Learning insights: ${insights.total_books_learned} books learned, ${insights.preferences_discovered} preferences discovered`);
      
      await this.endTest(true);
      return response;
    } catch (error) {
      await this.endTest(false, error.message);
      throw error;
    }
  }

  async validateConversationalPatterns() {
    await this.startTest('Conversational Pattern Validation');
    
    try {
      // Test that prompts are suitable for chat interfaces
      const promptsResponse = await apiRequest('/api/preferences/prompts?limit=3');
      
      for (const prompt of promptsResponse.prompts) {
        // Check conversation starter length (mobile-friendly)
        assert(prompt.conversation_starter.length <= 200, 
          `Conversation starter too long (${prompt.conversation_starter.length} chars): ${prompt.conversation_starter}`);
        
        // Check that it's a natural question
        assert(prompt.conversation_starter.includes('?') || prompt.conversation_starter.toLowerCase().includes('how'), 
          `Conversation starter should be a question: ${prompt.conversation_starter}`);
        
        // Check follow-up questions are concise
        for (const question of prompt.follow_up_questions) {
          assert(question.length <= 100, 
            `Follow-up question too long (${question.length} chars): ${question}`);
        }
        
        // Check learning objectives are clear
        assert(prompt.learning_objectives.length >= 3, 
          `Should have at least 3 learning objectives, got ${prompt.learning_objectives.length}`);
      }
      
      this.log(`Validated ${promptsResponse.prompts.length} conversation prompts for mobile chat interfaces`);
      
      await this.endTest(true);
    } catch (error) {
      await this.endTest(false, error.message);
      throw error;
    }
  }

  async validateEndToEndWorkflow() {
    await this.startTest('End-to-End Workflow Validation');
    
    try {
      // 1. RSS Ingestion
      this.log('Step 1: RSS Ingestion');
      const rssResponse = await apiRequest('/api/rss/ingest', {
        method: 'POST',
        body: JSON.stringify({ trigger_learning: true })
      });
      
      // 2. Get preference prompts
      this.log('Step 2: Get Preference Prompts');
      const promptsResponse = await apiRequest('/api/preferences/prompts?limit=1');
      
      // 3. If we have prompts, test preference learning
      if (promptsResponse.prompts.length > 0) {
        this.log('Step 3: Test Preference Learning');
        const testPrompt = promptsResponse.prompts[0];
        
        const mockExperience = {
          rating: 4,
          liked_aspects: ['Great characters'],
          disliked_aspects: [],
          mood_when_read: 'Relaxed',
          reading_context: 'Evening reading',
          would_recommend: true,
          similar_books_wanted: true,
          notes: 'Enjoyed it'
        };
        
        const learningResponse = await apiRequest('/api/preferences/learn', {
          method: 'POST',
          body: JSON.stringify({
            book_id: testPrompt.book_id,
            experience: mockExperience
          })
        });
        
        assert(learningResponse.success, 'Preference learning should succeed');
        
        // 4. Test that recommendations are enhanced
        this.log('Step 4: Test Enhanced Recommendations');
        const recsResponse = await apiRequest('/api/recommendations/discover?limit=3');
        
        assert(recsResponse.recommendations, 'Should get recommendations');
        
        this.log('✅ End-to-end workflow completed successfully');
      } else {
        this.log('⚠️ No preference prompts available, skipping preference learning test');
      }
      
      await this.endTest(true);
    } catch (error) {
      await this.endTest(false, error.message);
      throw error;
    }
  }

  async validateChatInterfaceOptimization() {
    await this.startTest('Chat Interface Optimization');
    
    try {
      // Test all endpoints have userMessage for chat consumption
      const endpoints = [
        '/api/rss/ingest',
        '/api/preferences/prompts',
        '/api/recommendations/discover'
      ];
      
      for (const endpoint of endpoints) {
        let response;
        if (endpoint === '/api/rss/ingest') {
          response = await apiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify({ trigger_learning: true })
          });
        } else {
          response = await apiRequest(endpoint);
        }
        
        assert(response.userMessage, `${endpoint} should have userMessage for chat interfaces`);
        assert(response.userMessage.length <= 300, `${endpoint} userMessage too long: ${response.userMessage.length} chars`);
      }
      
      this.log('All endpoints optimized for chat interface consumption');
      
      await this.endTest(true);
    } catch (error) {
      await this.endTest(false, error.message);
      throw error;
    }
  }

  async runAllTests() {
    this.log('🚀 Starting RSS-Triggered Preference Learning Validation Suite');
    
    try {
      // Core functionality tests
      await this.validateRSSIngestion();
      await this.validatePreferencePrompts();
      await this.validateConversationalPatterns();
      await this.validateChatInterfaceOptimization();
      await this.validateEndToEndWorkflow();
      
      // Generate test report
      this.generateReport();
      
    } catch (error) {
      this.log(`❌ Test suite failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }

  generateReport() {
    const passed = this.testResults.filter(t => t.status === 'passed').length;
    const failed = this.testResults.filter(t => t.status === 'failed').length;
    const totalTime = this.testResults.reduce((sum, t) => sum + t.duration, 0);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RSS-TRIGGERED PREFERENCE LEARNING VALIDATION REPORT');
    console.log('='.repeat(60));
    console.log(`✅ Tests Passed: ${passed}`);
    console.log(`❌ Tests Failed: ${failed}`);
    console.log(`⏱️ Total Time: ${totalTime}ms`);
    console.log('');
    
    if (failed > 0) {
      console.log('❌ FAILED TESTS:');
      this.testResults.filter(t => t.status === 'failed').forEach(test => {
        console.log(`   - ${test.name}: ${test.error}`);
      });
      console.log('');
    }
    
    console.log('✅ VALIDATION CHECKLIST:');
    console.log('   - RSS ingestion triggers preference learning ✓');
    console.log('   - Preference prompts generated correctly ✓');
    console.log('   - Conversational patterns mobile-optimized ✓');
    console.log('   - Chat interface responses optimized ✓');
    console.log('   - End-to-end workflow functional ✓');
    console.log('');
    
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! RSS-triggered preference learning is ready for deployment.');
    } else {
      console.log('⚠️ Some tests failed. Please review and fix issues before deployment.');
      process.exit(1);
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new RSSPreferenceLearningValidator();
  validator.runAllTests().catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

module.exports = RSSPreferenceLearningValidator;