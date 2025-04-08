const asyncHandler = require("express-async-handler");
const commitmentsModel = require("../Models/commitmentsModel");
const campainModel = require("../Models/campaignModel");
const paymentModel = require("../models/paymentModel");
const People = require("../models/peopleModel");
const AppError = require("../utils/AppError");
// const { backupDatabase } = require("../backup/backups/backup");
const memorialDaysModel = require("../Models/memorialDaysModel");



const {
  recordAddOperation,
  recordNewPaymentOperation,
  recordDeleteOperation,
  recordEditOperation,
} = require("../utils/RecordOperation");
const { default: mongoose } = require("mongoose");
const validPaymentMethods = [
  'מזומן', , 'העברה בנקאית', 'הבטחה',
  'משולב', 'כרטיס אשראי', 'שיקים', 'לא סופק',
  'הוראת קבע', 'אשראי הו"ק', 'קיזוז', 'החזר תשלום','החזר תשלום מזומן'
];


const validateCommitmentFields = (commitment, isUpdate) => {
  // Convert to numbers to avoid issues with string-based inputs
  commitment.CommitmentAmount = Number(commitment.CommitmentAmount);
  commitment.AmountPaid = Number(commitment.AmountPaid ?? 0);  // Default to 0 if falsy
  commitment.PaymentsMade = Number(commitment.PaymentsMade ?? 0);  // Default to 0 if falsy
  commitment.NumberOfPayments = Number(commitment.NumberOfPayments);
  if (isUpdate) {
    commitment.AmountRemaining = Number(commitment.AmountRemaining ?? commitment.CommitmentAmount);  // Default to CommitmentAmount if falsy
    commitment.PaymentsRemaining = Number(commitment.PaymentsRemaining ?? commitment.NumberOfPayments);  // Default to NumberOfPayments if falsy
  }
  else {
    commitment.AmountRemaining = Number(commitment.AmountRemaining || commitment.CommitmentAmount);  // Default to CommitmentAmount if falsy
    commitment.PaymentsRemaining = Number(commitment.PaymentsRemaining || commitment.NumberOfPayments);  // Default to NumberOfPayments if falsy

  }

  // Check for invalid CommitmentAmount or NumberOfPayments
  if (commitment.CommitmentAmount <= 0) {
    return "סכום התחייבות שנותר לא תקין";
  }
  if (commitment.NumberOfPayments && commitment.NumberOfPayments <= 0) {
    return "מספר התשלומים לא תקין";
  }

  // Check for negative AmountRemaining or PaymentsRemaining
  if (commitment.AmountRemaining < 0) {
    return 'סכום שנותר לתשלום אינו יכול להיות שלילי.';
  }
  if (commitment.PaymentsRemaining < 0) {
    return 'סכום שנותר לתשלומים אינו יכול להיות שלילי.';
  }

  // Check if CommitmentAmount is not less than AmountPaid
  if (commitment.CommitmentAmount < commitment.AmountPaid) {
    return "סכום התחייבות לא יכול להיות קטן מסכום התחייבות שנותר.";
  }

  // Check if NumberOfPayments is not less than PaymentsMade
  if (commitment.NumberOfPayments && commitment.NumberOfPayments < commitment.PaymentsMade) {
    return "מספר התשלומים לא יכול להיות קטן ממספר התשלומים שנותרו.";
  }

  // Check if the remaining amount matches the difference between CommitmentAmount and AmountPaid
  if (commitment.CommitmentAmount - commitment.AmountPaid != commitment.AmountRemaining) {
    return " סכום שנותר לתשלום לא תקין";
  }

  // Check if the remaining payments match the difference between NumberOfPayments and PaymentsMade
  if (commitment.NumberOfPayments && commitment.NumberOfPayments - commitment.PaymentsMade != commitment.PaymentsRemaining) {
    return " מספר התשלומים שנותרו לא תקין";
  }

  return null;  // Return null if all validations pass
};


exports.reviewCommitments = asyncHandler(async (req, res, next) => {
  let commitments = Array.isArray(req.body) ? req.body : [req.body];
  const { campainName } = req.query;
  const invalidCommitments = [];
  let validCommitments = [];

  const activePeople = await People.find({ isActive: true });
  const activePeopleMap = new Map(
    activePeople.map((person) => [person.AnashIdentifier, person])
  );

  // Filter out and enrich valid commitments
  const enrichedCommitments = commitments.map((commitment) => {
    if (!commitment.AnashIdentifier) {
      return { ...commitment, reason: "מזהה אנש לא סופק" };
    }
    commitment.AnashIdentifier = String(commitment.AnashIdentifier);

    const person = activePeopleMap.get(commitment.AnashIdentifier);

    if (!person) {
      return { ...commitment, reason: "מזהה אנש לא קיים במערכת או לא פעיל" };
    }

    commitment.FirstName = person.FirstName || commitment.FirstName;
    commitment.LastName = person.LastName || commitment.LastName;
    commitment.PersonID = person.PersonID || commitment.PersonID;

    if (!commitment.CampainName && !campainName) {
      return { ...commitment, reason: "שם קמפיין לא סופק" };
    }
    if (campainName && commitment.CampainName && commitment.CampainName !== campainName) {
      return { ...commitment, reason: "שם קמפיין לא תואם לדף הקמפיין" };
    }
    if (!commitment.CommitmentAmount || commitment.CommitmentAmount <= 0)
      return { ...commitment, reason: "סכום התחייבות לא תקין" };
    if (!commitment.PaymentMethod || !validPaymentMethods.includes(commitment.PaymentMethod)) {
      return { ...commitment, reason: "אופן התשלום לא תקין" };
    }

    return commitment;
  });

  const filteredCommitments = enrichedCommitments.filter((commitment) => {
    if (commitment.reason) {
      invalidCommitments.push(commitment);
      return false;
    }
    return true;
  });

  const uniqueCampaignNames = [
    ...new Set(filteredCommitments.map((c) => c.CampainName)),
  ];
  const allCampaigns = await campainModel.find({
    CampainName: { $in: uniqueCampaignNames },
  });
  const campaignMap = new Map(
    allCampaigns.map((campaign) => [campaign.CampainName, campaign])
  );

  const allExistingCommitments = await commitmentsModel.find({
    AnashIdentifier: { $in: filteredCommitments.map((c) => c.AnashIdentifier) },
    CampainName: { $in: uniqueCampaignNames },
  });

  const seenCommitments = new Set();

  for (const commitment of filteredCommitments) {
    const campaign = campaignMap.get(commitment.CampainName);
    if (!campaign) {
      invalidCommitments.push({
        ...commitment,
        reason: "קמפיין לא קיים במערכת",
      });
      continue;
    }

    const isExisting = allExistingCommitments.some((existing) => {

      // Directly return the result of the condition
      return existing.AnashIdentifier === commitment.AnashIdentifier &&
        existing.CampainName === commitment.CampainName;
    });

    if (isExisting) {
      invalidCommitments.push({
        ...commitment,
        reason: "התחייבות כבר קיימת במערכת",
      });
      continue;
    }

    const fieldError = validateCommitmentFields(commitment, false);
    if (fieldError !== null) {
      invalidCommitments.push({ ...commitment, reason: fieldError });
      continue;
    }

    // Create a unique key for `AnashIdentifier` and `CampainName`
    const uniqueKey = `${commitment.AnashIdentifier}-${commitment.CampainName}`;

    if (seenCommitments.has(uniqueKey)) {
      invalidCommitments.push({
        ...commitment,
        reason: " התחייבות כפולה עם אותו אנש ואותו שם קמפיין באותה העלאה",
      });
      continue;
    }
    if (commitment.PaymentMethod && !validPaymentMethods.includes(commitment.PaymentMethod)) {
      invalidCommitments.push({
        ...commitment,
        reason: "אופן התשלום לא תקין",
      });
      continue;
    }



    seenCommitments.add(uniqueKey);
    validCommitments.push(commitment);
  }

  res.status(200).json({
    status: "success",
    validCommitments,
    invalidCommitments,
  });
});


exports.updateCommitmentDetails = asyncHandler(async (req, res, next) => {
  const commitment = req.body;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const person = await People.findOne({
      AnashIdentifier: commitment.AnashIdentifier,
      isActive: true,
    }).session(session);

    if (!person)
      throw new AppError(400, "מזהה אנש לא קיים במערכת או לא פעיל");

    const exsitCommitment = await commitmentsModel.findById(commitment._id).session(session);
    if (!exsitCommitment)
      throw new AppError(400, "התחייבות לא נמצאה");

    if (!commitment.CommitmentAmount || commitment.CommitmentAmount <= 0)
      throw new AppError(400, "סכום התחייבות לא תקין");

    const campain = await campainModel.findOne({ CampainName: commitment.CampainName }).session(session);
    if (!campain)
      throw new AppError(400, "קמפיין לא זוהה");

    const amountPerMemorialDay = campain.minimumAmountForMemorialDay;
    if (commitment.CommitmentAmount < amountPerMemorialDay * commitment.MemorialDays.length)
      throw new AppError(400, "סכום ההתחייבות אינו מספיק למספר ימי ההנצחה");

    const fieldError = validateCommitmentFields(commitment, true);
    if (fieldError) throw new AppError(400, fieldError);

    const recordedOperation = recordEditOperation({
      UserFullName: req.user?.FullName,
      Date: new Date(),
      OperationType: "עריכה",
      Desc: `עריכת התחייבות מקמפיין ${commitment.CampainName}`,
      OldValues: exsitCommitment,
      NewValues: commitment,
    });

    // Update the People record
    if (recordedOperation) {
      await People.findOneAndUpdate(
        { AnashIdentifier: commitment.AnashIdentifier },
        {
          $push: {
            CommitmentsOperations: {
              $each: [recordedOperation],
              $slice: -20,
            },
          },
        },
        { session }
      );
    }

    // Update the Commitment
    const updatedCommitment = await commitmentsModel.findOneAndUpdate(
      { _id: commitment._id },
      { $set: commitment },
      { new: true, session }
    );

    if (!updatedCommitment)
      throw new AppError(404, "התחייבות לא נמצאה");

    // Commit the transaction
    await session.commitTransaction();
    res.status(200).json({
      status: "success",
      updatedCommitment,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
})


exports.uploadCommitments = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();
  // console.log('eee')

  try {
    session.startTransaction();

    const commitments = Array.isArray(req.body) ? req.body : [req.body];


    // Insert commitments within the transaction
    const uploadedCommitments = await commitmentsModel.insertMany(commitments, { session });

    if (!uploadedCommitments?.length) {
      throw new AppError("Commitments not uploaded", 404);
    }

    const anashIdentifiers = uploadedCommitments.map(commitment => commitment.AnashIdentifier);

    // Find all the people with matching AnashIdentifiers (within the transaction)
    const people = await People.find({ AnashIdentifier: { $in: anashIdentifiers } }).session(session);

    // Prepare the bulk updates for people who need to update their campaigns array
    const bulkUpdates = [];

    for (const commitment of uploadedCommitments) {
      const { AnashIdentifier, CampainName } = commitment;

      const person = people.find(p => p.AnashIdentifier === AnashIdentifier);

      if (person) {
        // Prepare the operation to record
        const recordedOperation = recordAddOperation({
          OperationType: `הוספה`,
          Desc: `הוספת תחייבות לקמפיין ${CampainName} בסך ${commitment.CommitmentAmount} ש"ח`,
          Data: commitment,
          Date: new Date(),
          UserFullName: req.user?.FullName
        });

        const update = {
          $push: {
            Campaigns: CampainName,
            CommitmentsOperations: {
              $each: [recordedOperation],
              $slice: -20,
            },
          },
        };

        // Add the update operation to the bulkUpdates array
        bulkUpdates.push({
          updateOne: {
            filter: { AnashIdentifier },
            update,
          },
        });
      }
    }

    // Execute all the updates in a single batch operation within the transaction
    if (bulkUpdates.length > 0) {
      await People.bulkWrite(bulkUpdates, { session });
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      uploadedCommitments,
    });
  } catch (error) {
    // console.log(error,'error')
    // Roll back the transaction in case of error
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
});





exports.reviewCommitmentPayments = async (req, res, next) => {
  try {
    const paymentsData = Array.isArray(req.body.data) ? req.body.data : [req.body.data];
    const campainName = req.body.campainName;

    const {
      validPaymentsWithCommitment,
      validPaymentsWithoutCommitment,
      invalidPayments,
    } = await reviewCommitmentPaymentsService(paymentsData, campainName);

    res.status(200).json({
      status: "success",
      validPaymentsWithCommitment,
      validPaymentsWithoutCommitment,
      invalidPayments,
    });
  } catch (error) {
    next(error);
  }
};



// פונקציה לתרגום שגיאות לעברית

exports.getCommitmentsByCampaign = asyncHandler(async (req, res, next) => {
  const { campainName, isActive } = req.query;

  // Step 1: Build filters for campaign and isActive
  const campainFilter = campainName ? { CampainName: campainName } : {};
  let isActiveFilter = {};

  if (isActive === "true") {
    isActiveFilter.isActive = true;
  } else if (isActive === "false") {
    isActiveFilter.isActive = false;
  }

  // Step 2: Retrieve the list of AnashIdentifiers based on the isActive filter
  let activePeople;
  if (isActive === "true" || isActive === "false") {
    activePeople = await People.find(isActiveFilter).select("AnashIdentifier");
  } else {
    // If no isActive filter, retrieve all AnashIdentifiers
    activePeople = await People.find().select("AnashIdentifier");
  }

  // Step 3: Get a list of AnashIdentifiers from the activePeople result
  const anashIdentifiers = activePeople.map(person => person.AnashIdentifier);

  // Step 4: Query commitments that match the AnashIdentifiers
  const commitments = await commitmentsModel
    .find({
      ...campainFilter,
      AnashIdentifier: { $in: anashIdentifiers } // Filter by AnashIdentifiers
    });

  // Step 5: Return the result
  res.status(200).json({
    status: "success",
    data: {
      commitments,
    },
  });
});



exports.getCommitmentById = asyncHandler(async (req, res, next) => {
  const commitmentId = req.params._id;
  const commitment = await commitmentsModel.findById(commitmentId);
  const payments = await paymentModel.find({ CommitmentId: commitmentId }).populate({
    path: 'AnashDetails', // Virtual field name
    select: 'Campaigns' // Only include specific fields
  })
;
  if (!commitment) {
    return next(new AppError("User not found", 404));
  }

  else {
    res.status(200).json({
      status: "success",
      data: {
        commitment,
        payments,
      },
    });
  }
});

exports.deleteCommitment = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();


    const commitmentId = req.params.commitmentId;

    // Check if there are payments associated with the commitment
    const commitmentPayments = await paymentModel
      .find({ CommitmentId: commitmentId })
      .session(session);

    if (commitmentPayments?.length > 0) {
      throw new AppError(400, "לא ניתן למחוק התחייבות כי קיימים תשלומים בהתחייבות");
    }
    
    
    // Delete commitment
    const deletedCommitment = await commitmentsModel
      .findByIdAndDelete(commitmentId)
      .session(session);

    if (!deletedCommitment) {
      throw new AppError(400, "התחייבות לא נמצאה");
    }
    const camapin  = await campainModel.findOne({CampainName: deletedCommitment.CampainName});
    const person = await People.findOne({AnashIdentifier: deletedCommitment.AnashIdentifier});


    
    
    const deletedPayments = await paymentModel
    .deleteMany({ CommitmentId: commitmentId })
    .session(session);
    
    await memorialDaysModel.updateMany(
      { 
        'types.person': person._id,
        campainId: camapin._id // ← כאן אתה מציב את ה-ID של הקמפיין שאתה רוצה
      },
      {
        $pull: {
          types: { person: person._id }
        }
      }
    ).session(session);
    await memorialDaysModel.deleteMany({
      campainId: camapin._id,
      types: { $size: 0 }
    }).session(session);
    // Find user for logging purposes
    const user = await People.findOne({
      AnashIdentifier: deletedCommitment.AnashIdentifier,
    }).session(session);


    if (user) {
      // Prepare record operation
      const recordOperation = recordDeleteOperation({
        Date: new Date(),
        OperationType: "מחיקה",
        UserFullName: req.user?.FullName,
        Data: deletedCommitment,
        Desc: `מחיקת התחייבות מקמפיין ${deletedCommitment.CampainName} סך ההתחייבות בגובה ${deletedCommitment.CommitmentAmount} ש"ח`,
      });


      // Save operation record to user
      user.CommitmentsOperations.push(recordOperation);
      await user.save({ session });
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Respond with success
    res.status(200).json({
      status: "success",
      message: "Commitment and related payments deleted successfully.",
    });
  } catch (error) {
    // Roll back the transaction
    await session.abortTransaction();
    session.endSession();

    next(error); // Pass the error to the global error handler
  }
});



exports.AddMemorialDayToPerson = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { AnashIdentifier, CampainName, MemorialDay } = req.body;

    // Find commitment
    const commitment = await commitmentsModel
      .findOne({ AnashIdentifier, CampainName })
      .session(session);

    if (!commitment) {
      throw new AppError("Commitment not found", 404);
    }

    // Find campaign
    const campain = await campainModel
      .findOne({ CampainName })
      .session(session);

    if (!campain) {
      throw new AppError("Campaign not found", 404);
    }

    // Check for existing memorial days with the same date
    const campainCommitments = await commitmentsModel
      .find({ CampainName })
      .session(session);

    let commitmentWithTheSameDate = "";
    const isMemorialDayAlreadySet = campainCommitments?.some((commitment) =>
      commitment.MemorialDays?.some((memDay) => {
        if (isTheSameDate(new Date(memDay.date), new Date(MemorialDay.date))) {
          commitmentWithTheSameDate = commitment;
          return true;
        }
        return false;
      })
    );

    if (isMemorialDayAlreadySet) {
      throw new AppError(
        400,
        `יום הנצחה תפוס על ידי ${commitmentWithTheSameDate.FirstName} ${commitmentWithTheSameDate.LastName}`
      );
    }

    // Check if there is enough money for the memorial day
    const isEnoughMoney =
      Math.floor(
        commitment.CommitmentAmount / campain.minimumAmountForMemorialDay
      ) - commitment.MemorialDays.length;

    if (isEnoughMoney <= 0) {
      throw new AppError("Not enough money", 400);
    }

    // Check for existing memorial day in the commitment
    const existingMemorialDayIndex = commitment.MemorialDays.findIndex((md) =>
      isTheSameDate(new Date(md.date), new Date(MemorialDay.date))
    );

    if (existingMemorialDayIndex !== -1) {
      // Override existing memorial day
      commitment.MemorialDays[existingMemorialDayIndex] = MemorialDay;
    } else {
      // Add new memorial day
      commitment.MemorialDays.push(MemorialDay);
    }

    // Save updated commitment
    const updatedCommitment = await commitment.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Respond with success
    res.status(200).json({
      status: "success",
      data: {
        updatedCommitment,
      },
    });
  } catch (error) {
    // Roll back the transaction
    await session.abortTransaction();
    session.endSession();

    next(error); // Pass error to the global error handler
  }
});

exports.DeleteMemorialDay = asyncHandler(async (req, res, next) => {
  const { AnashIdentifier, CampainName, date } = req.query;
  const session = await commitmentsModel.startSession();

  try {
    session.startTransaction();

    const commitment = await commitmentsModel.findOne({
      AnashIdentifier: AnashIdentifier,
      CampainName: CampainName,
    }).session(session);

    if (!commitment) {
      await session.abortTransaction();
      session.endSession();
      return next(new AppError("Commitment not found", 404));
    }

    let updatedMemorialDays = commitment.MemorialDays.filter((day) => {
      return !isTheSameDate(new Date(day.date), new Date(date));
    });

    if (updatedMemorialDays.length === commitment.MemorialDays.length) {
      await session.abortTransaction();
      session.endSession();
      return next(new AppError("Date not found", 404));
    }

    commitment.MemorialDays = updatedMemorialDays;
    const updatedCommitment = await commitment.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      data: {
        updatedCommitment,
      },
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(new AppError(`Transaction failed: ${err.message}`, 500));
  }
});

function isTheSameDate(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}


exports.getCommitment = asyncHandler(async (req, res, next) => {
  const commitments = await commitmentsModel.find();

  if (!commitments) {
    return next(new AppError("Commitments not found", 404));
  }
  res.status(200).json({
    status: "success",
    data: {
      commitments,
    },
  });
});

exports.getCampainIncomSummeryByPaymentMethod = asyncHandler(async (req, res, next) => {
  const { campainName } = req.params;

  let campain;
  if (campainName) {
    campain = await campainModel.findOne({ CampainName: campainName });
    if (!campain) {
      return next(new AppError("קמפיין לא נמצא", 404)); // 404 Not Found
    }
  }
  const campainQuery = campain ? { CampainName: campainName } : {}
  // const commitments = await commitmentsModel
  //   .find(campainQuery) // If campainName is undefined, find all
  const payments = await paymentModel.find(campainQuery);
  const commitments = await commitmentsModel.find(campainQuery);

  const incomsByPaymentsMethods = {}

  for (const payment of payments) {
   
    incomsByPaymentsMethods[payment.PaymentMethod] = 
    (incomsByPaymentsMethods[payment.PaymentMethod] || 0) + payment.Amount;
      
  }
  const commitmentAmoutByPaymentMethod = commitments.reduce((acc, commitment) => {
    acc[commitment.PaymentMethod] = (acc[commitment.PaymentMethod] || 0) + commitment.CommitmentAmount;
    return acc;
  }, {});




  res.status(200).json({
    status: "success",
    incomsByPaymentsMethods,
    commitmentAmoutByPaymentMethod
  });
});





exports.getMemorialDaysByDate = asyncHandler(async (req, res, next) => {
  const memorialDayDate = new Date(req.params.date);
  // console.log(memorialDayDate)
  const nextDay = new Date(memorialDayDate);
  nextDay.setDate(nextDay.getDate() + 1);
  // const memorialDate2 = await memorialDaysModel.findOne({
  // })

//console.log(memorialDate2)
const memorialDate = await memorialDaysModel.findOne({
  date: {
    $gte: memorialDayDate,
    $lt: nextDay
  }
})
.populate('types.person') // זה השדה האמיתי שצריך לפופולייט
console.log(memorialDate)

  



  res.status(200).json(memorialDate||[]);
});



exports.GetEligblePeopleToMemmorialDay = asyncHandler(
  async (req, res, next) => {
    const { campainName } = req.params;
    const campain = await campainModel.findOne({ CampainName: campainName });
    if (!campain) {
      return next(new AppError("Campain not found", 404));
    }
    const maxTypes = campain.types.length;
    const commitments = await commitmentsModel
      .find({ CampainName: campainName })
      .populate("person");

    // if (!commitments || commitments.length === 0) {
    //   return next(new AppError("Commitments not found", 404));
    // }
    let people = [];

    commitments.forEach((commitment) => {
        people.push(commitment.person); // This is the person associated with the commitment
      
    });

    res.status(200).json({
      status: "success",
      data: {
        people,
        campain
      },
    });
  }
);



exports.updateMemorialDay = asyncHandler(async (req, res, next) => {
  const memorialDay = req.body;
  const session = await memorialDaysModel.startSession();

  try {
    session.startTransaction();

    const result = await memorialDaysModel.updateOne(
      { date: memorialDay.date },
      memorialDay,
      { upsert: true, session }
    );

    if (memorialDay.types.length === 0) {
      await memorialDaysModel.deleteOne({ date: memorialDay.date }, { session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      result
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(new AppError(`Transaction failed: ${err.message}`, 500));
  }
});
exports.getMemorialDaysByRangeDates = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const memorialDays = await memorialDaysModel.find({
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: 1 });




  res.status(200).json(memorialDays);
});
exports.getMemorialDaysByCommitment = asyncHandler(async (req, res, next) => {
  const { AnashIdentifier, CampainName } = req.query;

  const person = await People.findOne({ AnashIdentifier });
  if (!person) {
    return res.status(404).json({ message: 'Person not found' });
  }
  // console.log(person)

  const campain = await campainModel.findOne({ CampainName });
  if (!campain) {
    return res.status(404).json({ message: 'Campaign not found' });
  }
  
  // console.log(campain.types)
  // שליפת כל ימי ההנצחה של הקמפיין
  const memorialDays = await memorialDaysModel
  .find({ campainId: campain._id }).sort({ date: 1 });
  // console.log(memorialDays)
  
  // סינון לפי הדרישה שלך
  const filteredMemorials = memorialDays
  .map(day => {
    // סינון כל ה-types לפי האדם המבוקש
    const matchingTypes = day.types.filter(type => {
      const isMatch = type.person?.equals(person._id);
      console.log('match?', isMatch);
      return isMatch;
    });
          // console.log(matchingTypes)
      
      // מחזיר רק אם יש לפחות אחד
      if (matchingTypes.length > 0) {
        return {
          ...day.toObject(), // הופך ל־JS Object רגיל
          types: matchingTypes
        };
      }
      
      return null;
    })
    .filter(Boolean); // מסנן את אלו שלא רלוונטיים
    // console.log('filteredMemorials',filteredMemorials)
    
    const orderedTypes = campain.types; // הסדר המקורי מהקמפיין
    // console.log(filteredMemorials)
    const sortedMemorialDays = filteredMemorials.map(doc => {
      // console.log('doc',doc)
      // console.log('doc',doc)
      const sortedTypes = [...doc.types].sort((a, b) =>
        orderedTypes.indexOf(a.name) - orderedTypes.indexOf(b.name)
      );
      return {
        ...doc,
        types: sortedTypes
      };
    });
  

// console.log('sortedMemorialDays',sortedMemorialDays)
  res.status(200).json(sortedMemorialDays);
});








  









