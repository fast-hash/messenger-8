const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      default: function defaultDisplayName() {
        return this.username;
      },
      trim: true,
    },
    role: {
      type: String,
      enum: ['doctor', 'nurse', 'admin', 'staff'],
      default: 'staff',
    },
    department: {
      type: String,
      default: null,
      trim: true,
    },
    jobTitle: {
      type: String,
      default: null,
      trim: true,
    },
    dndEnabled: {
      type: Boolean,
      default: false,
    },
    dndUntil: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

userSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
