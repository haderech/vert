#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] notified2 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void empty(){}
   
   [[eosio::on_notify("*::send2")]]
   void send2(name owner, int64_t value) {
      print(" 4 ");

      receive4_action r4_action("receiver"_n, {get_self(), "active"_n});
      r4_action.send(value);

      require_recipient("notified4"_n);
   }

   void receive4(int64_t value);
   using receive4_action = action_wrapper<"receive4"_n, &notified2::receive4>;
};
