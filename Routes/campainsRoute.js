const express = require('express')
const  campainController = require('../Controllers/campainController')
const authController = require('../Controllers/AuthController')
const router = express.Router()



router.route('/add-campain').post( authController.protect,  campainController.addCampain)
router.route('/get-campains').get( authController.protect, campainController.getCampains)
router.route('/get-campain-people/:campainName').get( authController.protect, campainController.getPeopleByCampain)
router.route('/get-people-not-in-campain/:campainName').get( authController.protect, campainController.getPeopleNotInCampain)
router.route('/add-person-to-campain').post(authController.protect, campainController.addPersonToCampaign)
router.route('/delete-person-from-campain/:AnashIdentifier/:CampainName').delete(authController.protect, campainController.deletePersonFromCampain)
router.route('/get-commitment-in-campain/:campainName').get(authController.protect, campainController.getCommitmentInCampain)
router.route('/get-campain-by-name/:campainName').get(authController.protect, campainController.getCampainByName)
router.route('/get-all-memorial-dates/:CampainName').get(authController.protect, campainController.getAllMemorialDates)
router.route('/edit-campain-details/:campainId').post( authController.protect, campainController.editCampainDetails)
router.route('/review-deleted-memorial-dates/:campainId').post(authController.protect, campainController.reviewDeletedMemorialDays)
router.route('/review-befour-add-people-to-campain').post( authController.protect, campainController.reviewBeforeAddPeopleToCampaign)
router.route('/add-people-to-campain').post( authController.protect, campainController.addPeopleToCampaign)
router.route('/delete-campain/:campainId').delete( authController.protect, campainController.deleteCampain)

module.exports = router