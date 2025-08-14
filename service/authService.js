const User = require("../model/User");

const createUser = async (userBody) => {
  return await User.create(userBody);
};

const getUserByFirebaseUId = async (firebaseUid) => {
  return await User.findOne({ firebaseUid });
};

async function getUserById(id) {
  const user = await User.findById(id);
  return user;
}

const updateUserById = async (id, updateData) => {
  const user = await User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  return user;
};

module.exports = {
  createUser,
  getUserByFirebaseUId,
  getUserById,
  updateUserById,
};
