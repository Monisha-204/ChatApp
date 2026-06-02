import mongoose from "mongoose";

mongoose.connect(
  "YOUR_URI_HERE"
)
.then(() => {
  console.log("CONNECTED");
  process.exit(0);
})
.catch(err => {
  console.error(err);
  process.exit(1);
});