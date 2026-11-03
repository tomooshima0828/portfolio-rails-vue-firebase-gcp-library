class CreateMembers < ActiveRecord::Migration[8.1]
  def change
    create_table :members do |t|
      t.string :firebase_uid, null: false

      t.timestamps
    end
    add_index :members, :firebase_uid, unique: true
  end
end
