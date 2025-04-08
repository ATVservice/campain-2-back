const mongoose = require('mongoose');
const { HiCodeBracket } = require('react-icons/hi2');

const memorialDaysSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  hebrewDate: { type: String, required: true },
  campainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: [true, 'CommitmentId Number is required']
  },

  types: {
    type: [
      {
        name: {
          type: String,
          default: '',
          required: [true, 'Identity Number is required']
        },
        person: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'People',
          required: [true, 'Identity Number is required']
        },
        Commeration: {
          type: String,
          default: ''
        }
      }
    ],
    validate: {
      validator: function (typesArray) {
        const names = typesArray.map(t => t.name);
        return new Set(names).size === names.length;
      },
      message: 'Duplicate type names are not allowed in a single document.'
    }
  }
});

   


  // type1: {
  //   person: {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'People', // this means: reference the _id of a People document
  //     required: [true, 'Identity Number is required']
  //   },
  //   Commeration: {
  //     type: String,
  //     default: ''
  //   }
  // },
  // type2: {
  //   person: {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'People',
  //     required: [true, 'Identity Number is required']
  //   },
  //   Commeration: {
  //     type: String,
  //     default: ''
  //   }
  // },
  // type3: {
  //   person: {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'People',
  //     required: [true, 'Identity Number is required']
  //   },
  //   Commeration: {
  //     type: String,
  //     default: ''
  //   }
  // },
  // type4: {
  //   person: {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'People',
  //     required: [true, 'Identity Number is required']
  //   },
  //   Commeration: {
  //     type: String,
  //     default: ''
  //   }
  // },
  // type5: {
  //   person: {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'People',
  //     required: [true, 'Identity Number is required']
  //   },
  //   Commeration: {
  //     type: String,
  //     default: ''
  //   }
  // }














const memorialDays = mongoose.models.memorialDays || mongoose.model('memorialDays', memorialDaysSchema);

module.exports = memorialDays;
