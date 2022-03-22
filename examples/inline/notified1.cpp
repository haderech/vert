#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] notified1 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void empty(){}

   [[eosio::on_notify("*::send2")]]
   void send2(name owner, int64_t value) {
      print(" 3 ");

      receive3_action r3_action("receiver"_n, {get_self(), "active"_n});
      r3_action.send(value);

      require_recipient("notified3"_n);
   }

   void receive3(int64_t value);
   using receive3_action = action_wrapper<"receive3"_n, &notified1::receive3>;
};
