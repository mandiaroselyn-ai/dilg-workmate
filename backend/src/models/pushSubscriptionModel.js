import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema({
  // The user this subscription belongs to (email or role for broadcasts)
  employeeEmail: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  accessLevel: { type: String, default: 'employee' },

  // 'web' = Web Push subscription object, 'expo' = Expo push token string
  type: { type: String, enum: ['web', 'expo'], required: true },

  // Web Push: { endpoint, keys: { p256dh, auth } }
  subscription: { type: mongoose.Schema.Types.Mixed, default: null },

  // Expo Push token
  expoToken: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

pushSubscriptionSchema.index({ employeeEmail: 1, type: 1 });
pushSubscriptionSchema.index({ accessLevel: 1, type: 1 });

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
