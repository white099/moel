module.exports = (req, res) => {
  try {
    // Lazy-require to catch startup/runtime initialization errors
    // and return a visible response instead of hard crash.
    const app = require('../server');
    return app(req, res);
  } catch (error) {
    console.error('[BOOT_ERROR]', error);
    return res.status(500).json({
      status: 'boot_error',
      message: error?.message || 'Unknown startup error'
    });
  }
};
