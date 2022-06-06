#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] n12 : public contract {
public:
   using contract::contract;

   [[eosio::on_notify("*::send")]]
   void send(int64_t value)
   {
      print(" 5 ");

      send_action i121("i121"_n, {get_self(), "active"_n});
      i121.send(value);

      require_recipient("n122"_n);
   }

   using send_action = action_wrapper<"send"_n, &n12::send>;

   [[eosio::action]]
   void abc(int64_t value){}
};
