module.exports = (_, res) => {
  res.status(200).json({
    status: 'ok',
    source: 'standalone-health',
    time: new Date().toISOString()
  });
};
