const router = require("express").Router();

router.get("/", (req, res) => {
    res.json({
        manager_url: process.env.MANAGER_URL
    });
});

module.exports = router;