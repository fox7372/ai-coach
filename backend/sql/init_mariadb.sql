CREATE DATABASE IF NOT EXISTS ai_learning
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

-- 如果你不想用 root 连接，可以创建项目专用用户。
-- 请把 your_password 改成自己的密码。
CREATE USER IF NOT EXISTS 'ai_learning_user'@'%' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON ai_learning.* TO 'ai_learning_user'@'%';
FLUSH PRIVILEGES;
