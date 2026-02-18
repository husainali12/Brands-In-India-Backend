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

const getUsers = async (req, res) => {
  const { page = 1, limit = 10, search = "" } = req.query;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;
  let filter = {};
  if (search) {
    filter = {
      $or: [
        { name: { $regex: search, $options: "i" } }, // case-insensitive
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ],
    };
  }
  // const skip = (page - 1) * limit;
  const users = await User.find(filter).skip(skip).limit(limitNum).lean();
  const totalUsers = await User.countDocuments();
  const totalPages = Math.ceil(totalUsers / limitNum);
  return {
    page: pageNum,
    limit: limitNum,
    totalUsers,
    totalPages,
    users,
  };
};

const updateUserById = async (id, updateData) => {
  const user = await User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  return user;
};
const findUserByEmail = async (email) => {
  return await User.findOne({ email });
};
const findUserByPhone = async (phone) => {
  return await User.findOne({ phone });
};
module.exports = {
  createUser,
  getUserByFirebaseUId,
  getUserById,
  updateUserById,
  getUsers,
  findUserByEmail,
  findUserByPhone,
};
