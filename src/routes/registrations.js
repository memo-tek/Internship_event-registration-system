const router = require('express').Router();
const Registration = require('../models/Registration');
const Event = require('../models/Event');
const { protect } = require('../middleware/auth');

// GET /api/registrations/me  -> my registrations
router.get('/me', protect, async (req, res, next) => {
  try {
    const registrations = await Registration.find({ user: req.user._id })
      .populate('event', 'title location date')
      .sort({ createdAt: -1 });
    res.json(registrations);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/registrations/:id  -> cancel my registration
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const registration = await Registration.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!registration) return res.status(404).json({ message: 'Registration not found' });
    await Event.updateOne({ _id: registration.event }, { $inc: { registeredCount: -1 } });
    res.json({ message: 'Registration cancelled' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
