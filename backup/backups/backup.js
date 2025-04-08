
require('dotenv').config(); // Load environment variables
const AppError = require("../../utils/AppError");

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const cron = require('node-cron');

// MongoDB connection details
const DB_URI = process.env.DB_URI;
const DB_NAME = process.env.DB_NAME;

// Directory to save the backup files
const BACKUP_DIR = path.join(__dirname);


// Function to run the backup
const backupMiddleware = async (req, res, next) => {
  // const commitments = Array.isArray(req.body) ? req.body : [req.body];
  const items = Array.isArray(req.body) ? req.body : [req.body];
  if(!items || items?.length <= 1){
    next();
    
  }


  // console.error("START OF MIDDLEWARE");
  // console.error("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
  // return next(new AppError(500, "גיבוי נכשל"));
  console.log(__dirname, "Starting backup process...");

  const backupFileName = `${DB_NAME}-backup.gz`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  const command = `mongodump --uri="${DB_URI}" --db=${DB_NAME} --archive=${backupFilePath} --gzip`;
  // const command = `mongodump --uri="${'mongodb+srv://shlomvoda:shloo22@avoda.cnqjtah.mongodb.net/Campain_dev?retryWrites=true&w=majority&appName=avoda'}" --db=${DB_NAME} --archive=${backupFilePath} --gzip`;
  console.log("Executing command:", command);

  try {
    const result = await execCommand(command);
    if(!result.success){
      return next(new AppError(500, "גיבוי נכשל"));
    }
    next();
  

  } catch (error) {
    console.error("Backup failed:", error.message);
    return next(new AppError(500, "גיבוי נכשל"));

  
  }
};

// Modernized helper function to execute commands
function execCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("Error during execution:", error.message);
       reject(error);
      }
      if (stderr) {
        console.warn("Command warnings:", stderr); // Log warnings
      }
      resolve({ success: true, output: stdout }); // Always resolve, whether warnings exist or not
    });
  });
}

// Function to clean up backups and keep only the last 3
function cleanupBackups() {
  fs.readdir(BACKUP_DIR, (err, files) => {
    if (err) {
      console.error("Failed to read backup directory:", err);
      return;
    }

    // Filter and sort the backup files by modification time (latest first)
    const backupFiles = files.result
      .filter(file => file.startsWith(DB_NAME + '-backup-') && file.endsWith(".gz"))
      .map(file => ({
        name: file,
        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // Sort by latest first

    // Keep only the latest 3 backups, delete older ones
    const filesToDelete = backupFiles.slice(3); // Files older than the latest 3 backups

    filesToDelete.forEach(file => {
      const filePath = path.join(BACKUP_DIR, file.name);
      fs.unlink(filePath, err => {
        if (err) {
          console.error(`Failed to delete backup file: ${filePath}`);
        } else {
          console.log(`Deleted old backup: ${filePath}`);
        }
      });
    });
  });
}

// Schedule the backup to run every 48 hours at 2 AM
let task;

function startJob() {
  if (!task) {
    task = cron.schedule('0 2 */2 * *', () => {
      console.log('Running backup at 2 AM every 48 hours...');
      backupDatabase();
    });
    console.log('Cron job started');
  } else {
    console.log('Cron job is already running');
  }
}

function stopJob() {
  if (task) {
    task.stop(); // Stop the cron job if it's running
    task = null; // Reset the task reference
    console.log('Cron job stopped');
  } else {
    console.log('No cron job is running');
  }
}

// Example usage
// startJob(); 
// stopJob();  // Call stopJob() to stop the job when necessary
module.exports = {
  backupMiddleware,
};