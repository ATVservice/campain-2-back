const express = require('express')
const authController = require('../Controllers/AuthController')
const router = express.Router()
const { restoreDatabaseMiddleware } = require('../backup/backups/restor');




router.route('/register').post(authController.register)
router.route('/login').post(authController.login)

router.route('/logout').get(authController.logout)
router.route('/users').get(authController.protect, authController.restrictTo(['Admin']), authController.getAllUsers)
router.route('/delete-user/:id').delete(authController.protect, authController.restrictTo(['Admin', 'User']), authController.DeleteUser)
router.route('/forgot-password').post(authController.forgotPassword)
router.route('/reset-password/:resetToken').post(authController.resetPassword)
router.route('/update-maneger-details').post(authController.protect,authController.restrictTo(['Admin', 'User']), authController.updateManagerDetails)
router.route('/validate-password').post( authController.protect,authController.restrictTo(['Admin', 'User']), authController.validatePassword)
router.route('/restore-database').get( authController.protect,authController.restrictTo(['Admin']), restoreDatabaseMiddleware)
router.route('/protect').get( authController.protect, (req, res) => res.status(200).json({ user: req.user, status: 'success' }))

module.exports = router