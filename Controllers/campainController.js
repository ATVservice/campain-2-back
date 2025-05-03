const asyncHandler = require("express-async-handler");
const AppError = require("../utils/AppError");
const mongoose = require("mongoose");
const campainModel = require("../Models/campaignModel");
const peopleModel = require("../models/peopleModel");
const commitmentModel2 = require("../Models/commitmentsModel")
const memorialDayModel = require("../Models/memorialDaysModel");

exports.addCampain = asyncHandler(async (req, res, next) => {

  const { startDate, endDate, CampainName ,types} = req.body;
  const hebrewStartDate = startDate.jewishDateStrHebrew;
  const hebrewEndDate = endDate.jewishDateStrHebrew;
  const newCampain = await campainModel.create({
    startDate: startDate.date,
    endDate: endDate.date,
    CampainName: CampainName,
    hebrewStartDate: hebrewStartDate,
    hebrewEndDate: hebrewEndDate,
    types:types
  });
  res.status(201).json({
    status: "success",
    data: {
      newCampain,
    },
  });
});
exports.getCampains = asyncHandler(async (req, res, next) => {
  const campains = await campainModel.find();
  res.status(200).json({
    status: "success",
    data: {
      campains: campains,
    },
  });
});
exports.getPeopleByCampain = asyncHandler(async (req, res, next) => {
  const campainName = req.params.campainName;
  // console.log('e')

 
    // Find all people whose Campaigns map contains the specified campainName
    const people = await peopleModel.find({ Campaigns: campainName});
    // console.log(people)

    // If no people are found, return a 404 status
    // if (!people || people.length === 0) {
    //   return next(new AppError(404, "No people found"));
    // }

    // Return the list of people
    res.status(200).json(people);
  
});
exports.getPeopleNotInCampain = asyncHandler(async (req, res, next) => {
  const campainName = req.params.campainName;

    // Find people who either do not have the Campaigns property
    // or have a Campaigns property that does not contain the specified campainName
    let people = await peopleModel.find({
      $and: [
        { isActive: { $eq: true } }, // Ensure isActive is true
        {
          $or: [
            { Campaigns: { $exists: false } }, // No Campaigns property
            { Campaigns: { $ne: campainName } }, // Campaigns property does not contain campainName
          ],
        },
      ],
    });
    // If no people are found, return a 404 status
    if (!people || people.length === 0) {
      people = [];
    }

    // Return the list of people
    res.status(200).json(people);
  
});

exports.addPersonToCampaign = asyncHandler(async (req, res, next) => {
  const { campainName, AnashIdentifier } = req.body;

  // Find the person by their identifier
  const person = await peopleModel.findOne({ AnashIdentifier , isActive: true });

  if (!person) {
    return res.status(404).json({ message: "  מזהה אנש לא נמצא או לא פעיל" });
  }

  // Initialize the Campaigns property as an array if it doesn't exist
  if (!person.Campaigns) {
    person.Campaigns = [];
  }
  if (person.Campaigns.includes(campainName)) {
    return next(new AppError(400, "אנש כבר בקמפיין"));
  }

  // Add the campaign ID to the person's campaigns array
  person.Campaigns.push(campainName);

  // Save the updated person document
  await person.save();

  res
    .status(200)
    .json({ message: "Campaign added to person successfully", person });
});
const validateAndEnrichPeople = async (campainName, people) => {
  const campain = await campainModel.findOne({ CampainName: campainName });
  if (!campain) {
    throw new AppError(404, "קמפיין לא נמצא");
  }
  if (people?.length === 0) {
    throw new AppError(404, "לא נמצאו אנשים להוספה");
  }

  const validPeopleToAdd = [];
  const invalidPeopleToAdd = [];
  const seenPeople = new Set();

  const activePeople = await peopleModel.find({ isActive: true });
  const activePeopleMap = new Map(
    activePeople.map((person) => [person.AnashIdentifier, person])
  );

  const enrichedPeople = people.map((person) => {
    if (!person.AnashIdentifier) {
      return { ...person, reason: "מזהה אנש לא סופק" };
    }
    person.AnashIdentifier = String(person.AnashIdentifier);
    const activePerson = activePeopleMap.get(person.AnashIdentifier);
    if (!activePerson) {
      return { ...person, reason: "מזהה אנש לא קיים במערכת או לא פעיל" };
    }
    person.FirstName = activePerson.FirstName || '';
    person.LastName = activePerson.LastName || '';

    if (activePerson.Campaigns?.includes(campainName)) {
      return { ...person, reason: "מזהה אנש קיים בקמפיין" };
    }
    if (seenPeople.has(person.AnashIdentifier)) {
      return {
        ...person,
        reason: "מזהה אנש הוכנס יותר מפעם אחת בקובץ ",
      };
    }

    seenPeople.add(person.AnashIdentifier);
    return person;
  });

  enrichedPeople.forEach((person) => {
    if (person.reason) {
      invalidPeopleToAdd.push(person);
    } else {
      validPeopleToAdd.push(person);
    }
  });

  return { validPeopleToAdd, invalidPeopleToAdd };
};


exports.reviewBeforeAddPeopleToCampaign = asyncHandler(async (req, res, next) => {
  try {
    const { campainName, people } = req.body;
    const { validPeopleToAdd, invalidPeopleToAdd } = await validateAndEnrichPeople(campainName, people);

    res.status(200).json({
      status: "success",
      validPeopleToAdd,
      invalidPeopleToAdd,
    });
  } catch (error) {
    next(error);
  }
});

exports.addPeopleToCampaign = asyncHandler(async (req, res, next) => {
  try {
    const { campainName, people } = req.body;
    const { validPeopleToAdd } = await validateAndEnrichPeople(campainName, people);

    const bulkUpdates = validPeopleToAdd.map((person) => ({
      updateOne: {
        filter: { 
          AnashIdentifier: person.AnashIdentifier,
          // Ensure that the campaign doesn't already exist in the Campaigns array
          Campaigns: { $ne: campainName } 
        },
        update: { 
          $push: { Campaigns: campainName } 
        },
      },
    }));
    
    await peopleModel.bulkWrite(bulkUpdates);

    res.status(200).json({ status: "success" });
  } catch (error) {
    next(error);
  }
});

exports.deletePersonFromCampain = asyncHandler(async (req, res, next) => {
  const { CampainName, AnashIdentifier } = req.params;
  console.log('1');
  
  try {
    console.log(req.params);
    // חיפוש האדם לפי מזהה האנ"ש
    const person = await peopleModel.findOne({ AnashIdentifier });
    // console.log(person)
// console.log(person)
    if (!person) {
      return next(new AppError(404, "מזהה אנש לא זוהה במערכת"));
    }

    // בדיקה אם הקמפיין קיים ברשימת הקמפיינים של האדם
    if (!person.Campaigns || !person.Campaigns.includes(CampainName)) {
    }
    // בדיקה אם קיימת התחייבות של האדם בקמפיין זה
    const commitments = await commitmentModel2.find({
      AnashIdentifier,
      CampainName,
    });

    if (commitments?.length > 0) {
      return next(new AppError(400, "לא ניתן למחוק כי לאנש יש התחייבות בקמפיין זה"));
    }
    // הסרה של הקמפיין מתוך רשימת הקמפיינים
    person.Campaigns = person.Campaigns?.filter(
      (campaign) => campaign !== CampainName
    );

    // שמירה של המסמך המעודכן
    await person.save();

    res
      .status(200)
      .json({ message: "Campaign removed from person successfully", person });
  } catch (error) {
    console.error("שגיאה בשרת:", error.message);
    res.status(500).json({ message: "שגיאה פנימית בשרת" });
  }
});

exports.getCommitmentInCampain = asyncHandler(async (req, res, next) => {
  const campainName = req.params.campainName;
  if (!campainName) {
    return next(new AppError(404, "campainId not defined"));
  }

  // מציאת כל ההתחייבויות ששייכות לשם הקמפיין
  const commitments = await commitmentModel2.find({ CampainName: campainName });

  // חישוב כמות ההתחייבויות, סכום ההתחייבות הכולל וסכום ששולם
  let totalCommitted = 0;
  let totalPaid = 0;

  // חישוב סכום ההתחייבויות והסכום ששולם
  commitments.forEach((commitment) => {
    totalCommitted += commitment.CommitmentAmount || 0;
    totalPaid += commitment.AmountPaid || 0;
  });

  // קבלת מספר ההתחייבויות
  const numberOfCommitments = commitments.length;

  res.status(200).json({
    status: "success",
    data: {
      commitments,
      totalCommitted,
      totalPaid,
      numberOfCommitments,
    },
  });
});

exports.getCampainByName = asyncHandler(async (req, res, next) => {
  const campainName = req.params.campainName;
  const campain = await campainModel.findOne({ CampainName: campainName });
  if (!campain) {
    return next(new AppError(404, "Campain not found"));
  }
  res.status(200).json({
    status: "success",
    data: {
      campain,
    },
  });
});

exports.getAllMemorialDates = asyncHandler(async (req, res, next) => {
  const campainName = req.params.CampainName;
  const campain = await campainModel.findOne({ CampainName: campainName });
  if (!campain) {
    return next(new AppError(404, "Campain not found"));
  }
  const campainCommitments = await commitmentModel2.find({
    CampainName: campainName,
  });
  const memorialDates = campainCommitments.flatMap((commitment) => {
    // Assuming each commitment has a `memorialDates` array
    return commitment.MemorialDays.map((dateObject) => dateObject.date); // Adjust this line based on your data structure
  });
  if (memorialDates.length === 0) {
    return next(new AppError(404, "No memorial dates found"));
  }
  res.status(200).json({
    status: "success",
    data: {
      memorialDates,
    },
  });
});

exports.editCampainDetails = asyncHandler(async (req, res, next) => {
    // console.log(req.body);
    const { startDate, endDate, CampainName,hebrewStartDate,hebrewEndDate } = req.body.updatedCampain;
    const memorialDaysToDelete = req.body.deletedMemorialDays;
    const campaignId = req.params.campainId;
    // console.log(campaignId);
  
    // Start a session for the transaction
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      // Fetch the campaign by ID
      const campaign = await campainModel.findById(campaignId).session(session);
      if (!campaign) throw new AppError(404, "קמפיין לא נמצא");
  
      // Check for conflicting dates
      const conflictingCampaign = await campainModel.findOne({
        _id: { $ne: campaignId },
        $or: [
          { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
        ],
      }).session(session);
  
      if (conflictingCampaign) throw new AppError(404, "תאריכים חופפים בקמפיין אחר");
  
      // Check for duplicate campaign names
      if (CampainName) {
        const existingName = await campainModel.findOne({
          CampainName,
          _id: { $ne: campaignId },
        }).session(session);
  
        if (existingName) throw new AppError(404, "שם הקמפיין קיים בקמפיין אחר");
      }
  
      // Prepare update fields dynamically
      const updateFields = {};
      if (startDate && startDate !== campaign.startDate)
      {

          updateFields.startDate = startDate;
          updateFields.hebrewStartDate = hebrewStartDate;
      }
      if (endDate && endDate !== campaign.endDate)
        {
            updateFields.endDate = endDate;
            updateFields.hebrewEndDate = hebrewEndDate;
        } 
            
      if (CampainName && CampainName !== campaign.CampainName) updateFields.CampainName = CampainName;
  
      // Update the campaign
      const updatedCampaign = await campainModel.findByIdAndUpdate(
        campaignId,
        { $set: updateFields },
        { new: true, session }
      );
      if (!updatedCampaign) throw new AppError(404, "בעיה בעדכון הקמפיין");
  
      // Update related collections if CampainName changes
      if (updateFields.CampainName) {
        await Promise.all([
          commitmentModel2.updateMany(
            { CampainName: campaign.CampainName },
            { $set: { CampainName: updateFields.CampainName } },
            { session }
          ),
          peopleModel.updateMany(
            { Campaigns: campaign.CampainName },
            { $set: { "Campaigns.$[elem]": updateFields.CampainName } },
            {
              arrayFilters: [{ elem: campaign.CampainName }],
              session,
            }
          ),
        ]);
      }
    //   throw new AppError(404, "בעיה בעדכון הקמפיין");
  
      // Handle MemorialDays deletion

      if (memorialDaysToDelete?.length > 0) {
        const idsToDelete = memorialDaysToDelete.map(doc => doc._id);
      
        const deleteResult = await memorialDayModel.deleteMany(
          { _id: { $in: idsToDelete } },
          { session }
        );
      
        console.log(`${deleteResult.deletedCount} memorial days deleted`);
      }
      
    
        
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();
  
      res.status(200).json({
        status: "success",
        data: { updatedCampaign },
      });
    } catch (error) {
      // Roll back the transaction in case of error
      await session.abortTransaction();
      session.endSession();
  
      // Pass error to the error handler
      next(error);
    }
  });
    
exports.reviewDeletedMemorialDays = asyncHandler(async (req, res, next) => {
  const campainId = req.params.campainId;
  const { startDate, endDate, CampainName } = req.body;
  
  const campaign = await campainModel.findById(campainId);
  if (!campaign) {
    return next(new AppError(404, "קמפיין לא נמצא"));
  }
  const originalStartDate = toDayString(campaign.startDate);
  const originalEndDate = toDayString(campaign.endDate);
  
  const updatedStartDate = toDayString(startDate);
  const updatedEndDate = toDayString(endDate);
  console.log(originalStartDate, originalEndDate);
  console.log(updatedStartDate, updatedEndDate);
    // const { startDate, endDate } = req.query;
    
  
  
    const deletedMemorialDays = await memorialDayModel.find({
      date: {
        $gte: originalStartDate,
        $lte: originalEndDate
      },
      $or: [
        { date: { $lt: updatedStartDate} },
        { date: { $gt: updatedEndDate } }
      ]
    }).populate('types.person');
    console.log(deletedMemorialDays);
          


  res.status(200).json({
    status: "success",

    deletedMemorialDays,
  });
});
function toDayString(date) {
  return new Date(date).toISOString().split('T')[0];
}


exports.deleteCampain = asyncHandler(async (req, res, next) => {
  const campainId = req.params.campainId;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const campain = await campainModel.findById(campainId).session(session);

    if (!campain) { 
      return next(new AppError(404, "קמפיין לא נמצא"));
    }
    const commitmentCount = await commitmentModel2.countDocuments({ CampainName: campain.CampainName }).session(session);
    if(commitmentCount > 0){
      return next(new AppError(404, "לא ניתן למחוק קמפיין כשיש התחייבויות בקמפיין")); 
    }

    const removeCampainFromPeople = await peopleModel.updateMany(
      { Campaigns: campain.CampainName },
      { $pull: { Campaigns: campain.CampainName } },
      { session }
    );

    const deletedCampain = await campainModel.findOneAndDelete(
      { _id: campainId },
      { session }
    );
    
    if (!deletedCampain) {
      return next(new AppError(404, "קמפיין לא נמצא"));
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      data: { deletedCampain },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(new AppError(error?.code, error));
  }
});



