const router = require('express').Router();
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/events  -> list events (?upcoming=true to hide past ones)
router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.upcoming === 'true' ? { date: { $gte: new Date() } } : {};
    const events = await Event.find(filter).sort({ date: 1 });
    res.json(events);
  } catch (err) {
    next(err);
  }
});

// GET /api/events/:id  -> event details
router.get('/:id', async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json({ ...event.toObject(), spotsLeft: event.capacity - event.registeredCount });
  } catch (err) {
    next(err);
  }
});

// POST /api/events  -> create (organizer)
router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const { title, description, location, date, capacity } = req.body;
    const event = await Event.create({
      title, description, location, date, capacity, createdBy: req.user._id,
    });
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// PUT /api/events/:id  -> update (organizer)
router.put('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (req.body.capacity !== undefined && req.body.capacity < event.registeredCount) {
      return res.status(400).json({ message: 'Capacity cannot be lower than current registrations' });
    }
    for (const field of ['title', 'description', 'location', 'date', 'capacity']) {
      if (req.body[field] !== undefined) event[field] = req.body[field];
    }
    await event.save();
    res.json(event);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/events/:id  -> delete event and its registrations (organizer)
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    await Registration.deleteMany({ event: event._id });
    res.json({ message: 'Event deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/events/:id/register  -> submit registration form (logged-in user)
router.post('/:id/register', protect, async (req, res, next) => {
  try {
    const fullName = req.body.fullName || req.user.name;
    const email = req.body.email || req.user.email;
    const phone = req.body.phone || '';

    // Atomically take a seat only if the event is upcoming and not full
    const event = await Event.findOneAndUpdate(
      {
        _id: req.params.id,
        date: { $gt: new Date() },
        $expr: { $lt: ['$registeredCount', '$capacity'] },
      },
      { $inc: { registeredCount: 1 } },
      { new: true }
    );

    if (!event) {
      const exists = await Event.findById(req.params.id);
      if (!exists) return res.status(404).json({ message: 'Event not found' });
      if (exists.date <= new Date()) return res.status(400).json({ message: 'Event already took place' });
      return res.status(409).json({ message: 'Event is full' });
    }

    try {
      const registration = await Registration.create({
        user: req.user._id, event: event._id, fullName, email, phone,
      });
      res.status(201).json(registration);
    } catch (err) {
      await Event.updateOne({ _id: event._id }, { $inc: { registeredCount: -1 } });
      if (err.code === 11000) {
        return res.status(409).json({ message: 'You are already registered for this event' });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/events/:id/registrations  -> attendee list (organizer)
router.get('/:id/registrations', protect, adminOnly, async (req, res, next) => {
  try {
    const registrations = await Registration.find({ event: req.params.id })
      .populate('user', 'name email')
      .sort({ createdAt: 1 });
    res.json(registrations);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
