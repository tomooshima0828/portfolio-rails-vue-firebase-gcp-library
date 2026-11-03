class Article < ApplicationRecord
  belongs_to :member

  validates :title, presence: true, length: { maximum: 100 }
  validates :body, presence: true
end
