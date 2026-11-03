module Api
  # ログインしている会員を返す。#11 で、ログインが Rails までつながったかを確かめるときにも使う
  class MeController < ApplicationController
    include FirebaseAuthenticatable

    before_action :authenticate_member!

    def show
      render json: { id: current_member.id, firebase_uid: current_member.firebase_uid }
    end
  end
end
