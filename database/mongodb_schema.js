// ============================================================================
// LedgerIQ: Automated Expense Tracker with OCR & Predictive Analytics
// MongoDB 7.0+ Document Database Setup Script (Collections, Validators & Indexes)
// Run via: mongosh "mongodb://127.0.0.1:27017/ledgeriq" database/mongodb_schema.js
// ============================================================================

const dbName = 'ledgeriq';
const database = db.getSiblingDB(dbName);

// 1. Users collection
database.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['full_name', 'email', 'password_hash', 'currency'],
      properties: {
        full_name: { bsonType: 'string' },
        email: { bsonType: 'string' },
        password_hash: { bsonType: 'string' },
        currency: { bsonType: 'string' },
        monthly_income_target: { bsonType: ['double', 'int', 'long'] },
        monthly_budget_limit: { bsonType: ['double', 'int', 'long'] },
        is_demo_account: { bsonType: 'bool' },
        created_at: { bsonType: 'date' },
      },
    },
  },
});
database.users.createIndex({ email: 1 }, { unique: true });

// 2. Categories collection
database.createCollection('categories', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'type'],
      properties: {
        user_id: { bsonType: ['objectId', 'null'] },
        name: { bsonType: 'string' },
        type: { enum: ['income', 'expense'] },
        is_default: { bsonType: 'bool' },
        color: { bsonType: 'string' },
      },
    },
  },
});
database.categories.createIndex({ user_id: 1, name: 1, type: 1 }, { unique: true });

// 3. Transactions collection
database.createCollection('transactions', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'category_name', 'type', 'amount', 'description', 'transaction_date'],
      properties: {
        user_id: { bsonType: 'objectId' },
        category_name: { bsonType: 'string' },
        type: { enum: ['income', 'expense'] },
        amount: { bsonType: ['double', 'int', 'long'], minimum: 0.01 },
        description: { bsonType: 'string' },
        merchant: { bsonType: 'string' },
        payment_method: { bsonType: 'string' },
        transaction_date: { bsonType: 'string' }, // YYYY-MM-DD
        receipt_id: { bsonType: ['objectId', 'null'] },
        is_recurring: { bsonType: 'bool' },
        predicted_category: { bsonType: ['string', 'null'] },
        prediction_confidence: { bsonType: ['double', 'int', 'null'] },
        created_at: { bsonType: 'date' },
      },
    },
  },
});
database.transactions.createIndex({ user_id: 1, transaction_date: -1 });
database.transactions.createIndex({ user_id: 1, category_name: 1 });

// 4. Receipts collection (embeds line items natively for fast single-document reads)
database.createCollection('receipts', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'merchant_name', 'receipt_date', 'total_amount'],
      properties: {
        user_id: { bsonType: 'objectId' },
        file_name: { bsonType: 'string' },
        image_url: { bsonType: 'string' },
        merchant_name: { bsonType: 'string' },
        receipt_date: { bsonType: 'string' },
        subtotal: { bsonType: ['double', 'int'] },
        tax_amount: { bsonType: ['double', 'int'] },
        total_amount: { bsonType: ['double', 'int'] },
        payment_info: { bsonType: 'string' },
        ocr_engine: { bsonType: 'string' },
        ocr_confidence: { bsonType: ['double', 'int'] },
        raw_text: { bsonType: 'string' },
        verified: { bsonType: 'bool' },
        items: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['item_name', 'total_price'],
            properties: {
              item_name: { bsonType: 'string' },
              quantity: { bsonType: ['double', 'int'] },
              unit_price: { bsonType: ['double', 'int'] },
              total_price: { bsonType: ['double', 'int'] },
            },
          },
        },
        created_at: { bsonType: 'date' },
      },
    },
  },
});
database.receipts.createIndex({ user_id: 1, receipt_date: -1 });

// 5. Budgets collection
database.createCollection('budgets');
database.budgets.createIndex({ user_id: 1, category_name: 1, month_key: 1 }, { unique: true });

// 6. Recurring expenses collection
database.createCollection('recurring_expenses');
database.recurring_expenses.createIndex({ user_id: 1, next_expected_date: 1 });

// 7. Savings goals collection
database.createCollection('savings_goals');
database.savings_goals.createIndex({ user_id: 1, target_date: 1 });

// 8. Forecast history collection
database.createCollection('forecast_history');
database.forecast_history.createIndex({ user_id: 1, created_at: -1 });

// 9. Chat history collection (SQL/Mongo RAG assistant turns)
database.createCollection('chat_history');
database.chat_history.createIndex({ user_id: 1, created_at: -1 });

// 10. Notifications collection
database.createCollection('notifications');
database.notifications.createIndex({ user_id: 1, is_read: 1 });

// 11. Model prediction feedback history
database.createCollection('model_prediction_history');
database.model_prediction_history.createIndex({ user_id: 1, created_at: -1 });

// Seed default global categories
const defaultCategories = [
  { user_id: null, name: 'Food', type: 'expense', is_default: true, color: '#2563EB' },
  { user_id: null, name: 'Rent', type: 'expense', is_default: true, color: '#1E293B' },
  { user_id: null, name: 'Transport', type: 'expense', is_default: true, color: '#0284C7' },
  { user_id: null, name: 'Shopping', type: 'expense', is_default: true, color: '#059669' },
  { user_id: null, name: 'Bills', type: 'expense', is_default: true, color: '#D97706' },
  { user_id: null, name: 'Entertainment', type: 'expense', is_default: true, color: '#7C3AED' },
  { user_id: null, name: 'Education', type: 'expense', is_default: true, color: '#4F46E5' },
  { user_id: null, name: 'Healthcare', type: 'expense', is_default: true, color: '#DC2626' },
  { user_id: null, name: 'Travel', type: 'expense', is_default: true, color: '#0D9488' },
  { user_id: null, name: 'Salary', type: 'income', is_default: true, color: '#059669' },
  { user_id: null, name: 'Allowance', type: 'income', is_default: true, color: '#2563EB' },
  { user_id: null, name: 'Freelance', type: 'income', is_default: true, color: '#7C3AED' },
];

for (const cat of defaultCategories) {
  database.categories.updateOne(
    { user_id: null, name: cat.name, type: cat.type },
    { $setOnInsert: cat },
    { upsert: true }
  );
}

print('LedgerIQ MongoDB collections, validators, indexes, and default categories initialized.');
