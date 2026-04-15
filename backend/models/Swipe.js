// HalaChat - Swipe Model
// سجل إعجابات/عدم إعجابات المستخدمين

const mongoose = require('mongoose');

const swipeSchema = new mongoose.Schema({
    swiper: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    swiped: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['like', 'dislike', 'superlike'],
        required: true
    }
}, { timestamps: true });

// منع swipe مكرر من نفس المستخدم لنفس الشخص
swipeSchema.index({ swiper: 1, swiped: 1 }, { unique: true });

module.exports = mongoose.model('Swipe', swipeSchema);
