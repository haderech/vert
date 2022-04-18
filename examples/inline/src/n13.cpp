#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] n13 : public contract {
public:
   using contract::contract;

   [[eosio::on_notify("*::send")]]
   void send(int64_t value)
   {
      print(" 12 ");

      send_action i131("i131"_n, {get_self(), "active"_n});
      i131.send(value);

      require_recipient("n132"_n);
   }

   using send_action = action_wrapper<"send"_n, &n13::send>;

   [[eosio::action]]
   void abc(int64_t value){}
};
